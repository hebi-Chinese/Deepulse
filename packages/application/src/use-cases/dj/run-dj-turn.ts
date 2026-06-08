// runDjTurn use case · DJ 一次对话回合的纯业务编排
// 输入: 用户发的 user_msg + 上下文; 输出: AsyncIterable<DjTurnEvent>
// 调用方 (WS 路由 / 未来 CLI / 单测) 只负责消费事件 + 转换成各自的输出格式
//
// 解耦点 (architect audit CRITICAL fix):
//   - WS framing 留在 apps/server/src/api/dj-ws.ts (只 send 到 socket)
//   - 业务编排 (Brain + segmenter + dispatcher + actions + persist) 来这里
//   - 依赖全走 ports, 测试可注入 fake
//
// 失败语义:
//   - Brain 失败 / abort → yield 'error' 事件后停止迭代 (不抛, 让调用方 graceful)
//   - TTS 失败 → 单句静默, 整轮不影响
//   - persist 失败 → log warn (调用方接 result), 整轮不影响

import { parseInlineActions } from '@claudio/shared/dj-ws'

import { buildDjPrompt } from '../../dj/prompt.js'
import { SentenceSegmenter } from '../../dj/sentence-segmenter.js'

import { distillSession } from './distill-session.js'

import type { DjContext } from '../../dj/types.js'
import type {
  ConversationEntry,
  IBrain,
  IClock,
  IConversationsRepo,
  ILongTermMemoryRepo,
  IShortTermMemoryRepo,
  ITtsClient,
  IUserPrefsRepo,
  LongTermEntry,
  SessionTurn,
  UserPrefs,
} from '../../ports/index.js'
import type { ParsedAction } from '@claudio/shared/dj-ws'

export type DjTurnEvent =
  | { readonly type: 'turn_start'; readonly turnId: string }
  | { readonly type: 'token'; readonly text: string }
  | { readonly type: 'sentence'; readonly idx: number; readonly text: string }
  | { readonly type: 'audio'; readonly sentenceIdx: number; readonly url: string }
  | { readonly type: 'action'; readonly action: ParsedAction }
  | { readonly type: 'reply_done'; readonly fullReply: string }
  | { readonly type: 'error'; readonly msg: string }

// 抽象 logger — 不绑 Fastify (use-case 不知道 web 框架存在)
export type UseCaseLogger = {
  readonly warn: (msg: string, err?: unknown) => void
  readonly debug?: (msg: string) => void
}

export type RunDjTurnDeps = {
  readonly brain: IBrain
  readonly tts: ITtsClient
  // shortTerm: 当前 session 的活跃对话 (Redis 热缓存); 替代旧的 conversations.recent
  readonly shortTerm: IShortTermMemoryRepo
  // longTerm: 跨 session 的累积事实 (用户是谁/喜好/近况); session 结束时自动 distill
  readonly longTerm: ILongTermMemoryRepo
  // 兼容保留: conversations 用于 sqlite 长期归档 (查询/分析用), 不进 prompt context
  readonly conversations: IConversationsRepo
  readonly userPrefs: IUserPrefsRepo
  readonly clock: IClock
  readonly log?: UseCaseLogger
}

export type RunDjTurnInput = {
  readonly turnId: string
  readonly userText: string
  readonly signal: AbortSignal
  readonly context?: DjContext
}

export async function* runDjTurn(
  deps: RunDjTurnDeps,
  input: RunDjTurnInput,
): AsyncGenerator<DjTurnEvent, void, void> {
  yield { type: 'turn_start', turnId: input.turnId }

  const startMs = deps.clock.nowMs()
  // 进 turn 前先检查: 上次 session 是否已过期但还有 turns 没 distill →
  // 现在 distill 完再继续, 让本轮 prompt 拿到刚 distill 的长期记忆
  await maybeDistillStaleSession(deps)
  const { sessionTurns, prefs, longTerm } = await loadAllMemory(deps)
  const messages = buildDjPrompt({
    history: sessionTurnsToHistory(sessionTurns),
    userText: input.userText,
    prefs,
    longTerm,
    ...(input.context !== undefined ? { context: input.context } : {}),
  })

  const stream = streamBrainTokens(deps, messages, input.signal)
  let fullReply = ''
  let aborted = false
  try {
    for await (const ev of stream) {
      if (input.signal.aborted) {
        aborted = true
        break
      }
      if (ev.type === 'token') fullReply += ev.text
      yield ev
    }
  } catch (err: unknown) {
    if (input.signal.aborted) return
    yield { type: 'error', msg: errMsg(err) }
    return
  }
  // 双重 check: streamBrainTokens 内部 detect 到 abort 时是悄悄 return (不抛),
  // 外层 for-await 只看到流提前结束 — 必须再查一次 signal, 否则会把"被打断的半句"
  // 当成正常完成 yield reply_done, 客户端收到误导信号
  if (aborted || input.signal.aborted) return

  const { cleaned, actions } = parseInlineActions(fullReply)
  for (const action of actions) yield { type: 'action', action }
  yield { type: 'reply_done', fullReply: cleaned }
  persistTurn(deps, input, cleaned, startMs)
}

// Fire-and-forget persist 双路: shortTerm Redis 热缓存 + sqlite 长期归档 (查询/分析)
function persistTurn(
  deps: RunDjTurnDeps,
  input: RunDjTurnInput,
  cleaned: string,
  startMs: number,
): void {
  const nowMs = deps.clock.nowMs()
  void deps.shortTerm
    .appendTurn({ tsMs: nowMs, userMsg: input.userText, djReply: cleaned })
    .catch((err: unknown) => {
      deps.log?.warn('runDjTurn: shortTerm.appendTurn failed', err)
    })
  void deps.conversations
    .append({
      tsMs: nowMs,
      userMsg: input.userText,
      djReply: cleaned,
      brainLatencyMs: nowMs - startMs,
    })
    .catch((err: unknown) => {
      deps.log?.warn('runDjTurn: conversations.append failed', err)
    })
}

// ─── memory: distill 边界 + 加载所有 prompt context ────────────────────

async function maybeDistillStaleSession(deps: RunDjTurnDeps): Promise<void> {
  try {
    const active = await deps.shortTerm.isSessionActive()
    if (active) return // session 还活 — 继续, 不 distill
    const turns = await deps.shortTerm.loadCurrentSession()
    if (turns.length === 0) return // 没遗留 turns 要消化
    // 上次 session 已过期且有内容 → 现在 distill (同步等完, 让本轮 prompt 拿到结果)
    deps.log?.debug?.(`runDjTurn: distilling ${String(turns.length)} stale turns`)
    await distillSession({
      brain: deps.brain,
      shortTerm: deps.shortTerm,
      longTerm: deps.longTerm,
      clock: deps.clock,
      ...(deps.log !== undefined ? { log: deps.log } : {}),
    })
  } catch (err: unknown) {
    // distill 失败不阻塞主 turn — 下次再试
    deps.log?.warn('runDjTurn: maybeDistillStaleSession failed', err)
  }
}

async function loadAllMemory(deps: RunDjTurnDeps): Promise<{
  readonly sessionTurns: readonly SessionTurn[]
  readonly prefs: UserPrefs
  readonly longTerm: readonly LongTermEntry[]
}> {
  // 三路并行加载, 任一失败用空默认 + 留 warn 痕迹
  const [sessionTurns, prefs, longTerm] = await Promise.all([
    deps.shortTerm.loadCurrentSession().catch((err: unknown) => {
      deps.log?.warn('runDjTurn: shortTerm.loadCurrentSession failed', err)
      return [] as readonly SessionTurn[]
    }),
    deps.userPrefs.load(deps.clock.nowMs()).catch((err: unknown) => {
      deps.log?.warn('runDjTurn: userPrefs.load failed', err)
      return { longTerm: '', shortTerm: '' } satisfies UserPrefs
    }),
    deps.longTerm.load().catch((err: unknown) => {
      deps.log?.warn('runDjTurn: longTerm.load failed', err)
      return [] as readonly LongTermEntry[]
    }),
  ])
  return { sessionTurns, prefs, longTerm }
}

// 最近 N 轮历史进 prompt, 老的丢掉 — 平衡上下文丰富度跟 token 成本
const SESSION_HISTORY_LIMIT = 6

// SessionTurn 跟 ConversationEntry 形状相近, buildDjPrompt 仍接 ConversationEntry —
// 只用 tsMs/userMsg/djReply 三个字段, 这里做映射
function sessionTurnsToHistory(turns: readonly SessionTurn[]): readonly ConversationEntry[] {
  return turns.slice(-SESSION_HISTORY_LIMIT).map((t) => ({
    tsMs: t.tsMs,
    userMsg: t.userMsg,
    djReply: t.djReply,
  }))
}

// ─── helpers ────────────────────────────────────────────────────────────

// Brain stream + 按句切 + 异步 TTS dispatch — 抹平成单一 event stream
async function* streamBrainTokens(
  deps: RunDjTurnDeps,
  messages: ReturnType<typeof buildDjPrompt>,
  signal: AbortSignal,
): AsyncGenerator<DjTurnEvent, void, void> {
  const segmenter = new SentenceSegmenter()
  const pendingAudio = new PendingAudioQueue()

  for await (const token of deps.brain.stream(messages, { signal })) {
    if (signal.aborted) return
    // 先吐已就绪的 audio event (上一轮 TTS 完成) — 放在 token 前确保真交叉
    // (放在 token 后会让 audio 总是慢于下一个 token, 退化成"半批处理")
    for (const ready of pendingAudio.drainReady()) yield ready
    yield { type: 'token', text: token }
    for (const sentence of segmenter.push(token)) {
      const { cleaned } = parseInlineActions(sentence)
      if (cleaned.length === 0) continue
      const idx = pendingAudio.allocate()
      yield { type: 'sentence', idx, text: cleaned }
      pendingAudio.startTts(deps, cleaned, idx)
    }
  }
  const tail = segmenter.flush()
  if (tail.length > 0) {
    const { cleaned } = parseInlineActions(tail)
    if (cleaned.length > 0) {
      const idx = pendingAudio.allocate()
      yield { type: 'sentence', idx, text: cleaned }
      pendingAudio.startTts(deps, cleaned, idx)
    }
  }
  // 等所有未完成的 TTS 收尾, 把对应 audio event yield 完
  for await (const ev of pendingAudio.flushRemaining()) yield ev
}

// 管理 TTS 的并发请求 — 按句 idx 顺序发起, 完成顺序 yield audio event
// 关键: drainReady 同步消费"已 settled"的 audio event, 实现"brain 还在吐 token,
// 已合成的句子已经能播了"的真交叉. 旧实现 drainReady 是空 generator,
// 所有 audio event 都堆到 flushRemaining 时一次性给, 流式 TTS 退化成串行批处理.
class PendingAudioQueue {
  private nextIdx = 0
  private inflightCount = 0
  private readonly ready: DjTurnEvent[] = []
  // 等待 inflight settle 的 resolver — flushRemaining 用来"睡到下一个 TTS 完成"
  private readonly waiters: (() => void)[] = []

  allocate(): number {
    const idx = this.nextIdx
    this.nextIdx += 1
    this.inflightCount += 1
    return idx
  }

  startTts(deps: RunDjTurnDeps, text: string, idx: number): void {
    deps.tts
      .synthesize({ text, emotion: '中立' })
      .then((tts) => {
        this.ready.push({ type: 'audio', sentenceIdx: idx, url: tts.audioUrl })
      })
      .catch((err: unknown) => {
        deps.log?.warn(`tts failed for sentence ${String(idx)}`, err)
      })
      .finally(() => {
        this.inflightCount -= 1
        // 唤醒一个 flushRemaining 等待者 (如果有的话)
        const waiter = this.waiters.shift()
        if (waiter !== undefined) waiter()
      })
  }

  // 同步消费已 settled 的 audio event — 在 brain token loop 每个 token 后调一次
  *drainReady(): Generator<DjTurnEvent> {
    while (this.ready.length > 0) {
      const ev = this.ready.shift()
      if (ev !== undefined) yield ev
    }
  }

  // brain 流结束后等剩余 TTS 收尾 — 边等边吐, 不批处理到最后
  async *flushRemaining(): AsyncGenerator<DjTurnEvent> {
    while (this.inflightCount > 0 || this.ready.length > 0) {
      yield* this.drainReady()
      if (this.inflightCount > 0) {
        // 注册 waiter, settle 时被 .finally 唤醒
        await new Promise<void>((resolve) => this.waiters.push(resolve))
      }
    }
  }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
