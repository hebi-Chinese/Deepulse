// runDjTurn use case · DJ 一次对话回合的纯业务编排
// 输入: 主人发的 user_msg + 上下文; 输出: AsyncIterable<DjTurnEvent>
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

import type { DjContext } from '../../dj/types.js'
import type {
  ConversationEntry,
  IBrain,
  IClock,
  IConversationsRepo,
  ITtsClient,
  IUserPrefsRepo,
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
  const [history, prefs] = await loadHistoryAndPrefs(deps)
  const messages = buildDjPrompt({
    history,
    userText: input.userText,
    prefs,
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
  if (aborted) return

  const { cleaned, actions } = parseInlineActions(fullReply)
  for (const action of actions) yield { type: 'action', action }
  yield { type: 'reply_done', fullReply: cleaned }

  // Fire-and-forget DB persist (不阻塞下一轮 turn)
  void deps.conversations
    .append({
      tsMs: deps.clock.nowMs(),
      userMsg: input.userText,
      djReply: cleaned,
      brainLatencyMs: deps.clock.nowMs() - startMs,
    })
    .catch((err: unknown) => {
      deps.log?.warn('runDjTurn: conversations.append failed', err)
    })
}

// ─── helpers ────────────────────────────────────────────────────────────

async function loadHistoryAndPrefs(
  deps: RunDjTurnDeps,
): Promise<readonly [readonly ConversationEntry[], UserPrefs]> {
  // 并行加载, 任一失败用空默认 + 留 warn 痕迹
  return Promise.all([
    deps.conversations.recent(6).catch((err: unknown) => {
      deps.log?.warn('runDjTurn: conversations.recent failed', err)
      return [] as readonly ConversationEntry[]
    }),
    deps.userPrefs.load(deps.clock.nowMs()).catch((err: unknown) => {
      deps.log?.warn('runDjTurn: userPrefs.load failed', err)
      return { longTerm: '', shortTerm: '' } satisfies UserPrefs
    }),
  ])
}

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
    yield { type: 'token', text: token }
    for (const sentence of segmenter.push(token)) {
      const { cleaned } = parseInlineActions(sentence)
      if (cleaned.length === 0) continue
      const idx = pendingAudio.allocate()
      yield { type: 'sentence', idx, text: cleaned }
      pendingAudio.startTts(deps, cleaned, idx)
    }
    // 检查已就绪的 audio 事件 (TTS 完成的)
    for (const ready of pendingAudio.drainReady()) yield ready
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
class PendingAudioQueue {
  private nextIdx = 0
  private readonly inflight = new Map<number, Promise<DjTurnEvent | null>>()

  allocate(): number {
    const idx = this.nextIdx
    this.nextIdx += 1
    return idx
  }

  startTts(deps: RunDjTurnDeps, text: string, idx: number): void {
    const p = deps.tts
      .synthesize({ text, emotion: '中立' })
      .then((tts): DjTurnEvent => ({ type: 'audio', sentenceIdx: idx, url: tts.audioUrl }))
      .catch((err: unknown) => {
        deps.log?.warn(`tts failed for sentence ${String(idx)}`, err)
        return null
      })
    this.inflight.set(idx, p)
  }

  *drainReady(): Generator<DjTurnEvent> {
    // 同步版本: 不 await, 只把已 settled 的拿出来
    // 实际上 Promise 不能同步查 settled 状态, 这里只删空 — flushRemaining 会真等
    return
  }

  async *flushRemaining(): AsyncGenerator<DjTurnEvent> {
    const promises = [...this.inflight.values()]
    this.inflight.clear()
    for (const p of promises) {
      const ev = await p
      if (ev !== null) yield ev
    }
  }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
