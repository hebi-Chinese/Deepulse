// DJ persona prompt 装配
// 系统提示分三段:
//   1. PERSONA       角色 + 真实电台 DJ 节奏感
//   2. USER PREFS    用户手写的长/短期喜好 (从 data/user-prefs/*.md 读)
//   3. CONTEXT       当前场景 (currentSong / queueLen / weather)
// 多轮历史 (最近 6 条) 转成 user/assistant 交替消息

import type { DjContext } from './types.js'
import type {
  BrainMessage,
  ConversationEntry,
  LongTermEntry,
  SessionTurn,
  UserPrefs,
} from '../ports/index.js'

// 真实电台 DJ 风格指令:
//   - 不每句都点评, 有时只用 1 句话承接, 有时一段开场/串场
//   - 用动作标签可以无缝换歌
//   - "节奏感" 体现在: 短句多, 偶尔长句, 不写文绉绉的散文
const PERSONA = `你是一位深夜中文电台的真人 DJ, 此刻陪伴正在收听的听众。

## 你是谁
- 一位普通的、自然的真人电台主播。
- 第一人称口吻, 称呼对面那位听众为"你"。
- 跟听众是电台主播跟夜里收音机前的朋友的关系 — 平等、自然。
- 全中文口语化, 温柔 + 一点俏皮 + 神秘感 — 深夜电台特有的氛围。
- 是真在做电台节目, 不是客服 — 别列点, 别标准回答, 别"好的, 已为您..."的腔。

## 真实电台 DJ 节奏 (核心)
- **不是每首歌都要长段口播**。模仿真电台 DJ 的节奏感:
    - 开场 (听众刚打开电台) → 来一段 (2-4 句, 带情绪/天气/时段感)
    - 普通串场 → 一句话承接 (8-15 字), "送你一首" / "下面这个" 这种
    - 你主动推一首特别想分享的歌 → 可以多说 (2-3 句, 讲讲为啥这首)
    - 听众随口问 / 闲聊 → 跟着话题走, 不必每句都拐到歌
- **长短交替, 不要每条都同样长度**。一段长 → 接一两条短 → 再长。
- **一段最长 4 句, 不能写散文**。宁可短促, 不要絮叨。
- 听众没问意见时, 不要主动评价歌好不好。

## 控制播放 (inline 标签会从听众看到的文本里被剥掉, 可自由穿插)
- \`<<play:关键词>>\`   立刻搜索播放, 关键词写歌名或 "歌手 歌名"
- \`<<queue:关键词>>\`  加进队列尾, 不打断当前
- \`<<next>>\`          跳下一首
- 用动作时, 前/后放一句口语承接 (如 "好这就放" / "下一首是这个")。
- 不要假装放歌 — 真要换歌就用标签, 不需要就别加。

## 输出格式
- 纯中文文字; 不带 emoji / 表情符号 / 装饰性符号 (深夜电台是 audio-first, 文字只是字幕)
- 不写英文 (除歌名 / 艺人名以外)
- 不写代码块, 不列点, 不解释这些规则
- 不把动作标签的语法念出来给听众听`

type BuildArgs = {
  readonly history: readonly ConversationEntry[]
  readonly userText: string
  readonly context?: DjContext
  readonly prefs?: UserPrefs
  // 自动 distill 出的长期记忆 (跨 session 累积, "几天后回来 DJ 还认得用户")
  readonly longTerm?: readonly LongTermEntry[]
}

export function buildDjPrompt(args: BuildArgs): readonly BrainMessage[] {
  const { history, userText, context, prefs, longTerm } = args
  // system 段: PERSONA + 长期记忆 + 用户手写偏好 + 当前场景
  // 顺序: PERSONA 永远在; 长期记忆 (有则放, 让 DJ 认得用户); prefs (手写补); context
  const sections: string[] = [PERSONA]
  const ltBlock = formatLongTerm(longTerm)
  if (ltBlock !== null) sections.push(ltBlock)
  const prefsBlock = formatPrefs(prefs)
  if (prefsBlock !== null) sections.push(prefsBlock)
  sections.push(formatContext(context))
  const messages: BrainMessage[] = [{ role: 'system', content: sections.join('\n\n') }]
  // 历史按 tsMs 升序, 取最近 6 条按时间顺序拼成 user / assistant 交替
  for (const entry of history) {
    messages.push({ role: 'user', content: entry.userMsg })
    messages.push({ role: 'assistant', content: entry.djReply })
  }
  messages.push({ role: 'user', content: userText })
  return messages
}

// ─── Distill prompt: session 结束时把 N 个 turn 总结成 1-2 句长期记忆 ──

const DISTILL_SYSTEM = `你是这个夜间电台 DJ 的"记忆 distill 助手"。
这位听众刚结束一段电台 session, 我会把这段 session 的对话给你看。
你要判断: 这段里有没有"几天后再聊也还需要记得"的事 — 比如对方讲了自己的偏好/不喜欢的歌手/新喜欢的风格/近况(失恋/搬家)。
**不要** 把"这段聊到一半没聊完的话头"当作值得记的 — 那是短期的, 一起丢掉.

输出 JSON: { "summary": "1-2 句中文总结, 中性叙事, 用第三人称'这位听众'或'TA'指代", "worthKeeping": true|false }
没值得记的就 worthKeeping=false, summary 留空字符串.`

export function buildDistillPrompt(turns: readonly SessionTurn[]): readonly BrainMessage[] {
  const transcript = turns.map((t) => `听众: ${t.userMsg}\nDJ: ${t.djReply}`).join('\n\n---\n\n')
  return [
    { role: 'system', content: DISTILL_SYSTEM },
    { role: 'user', content: `这段 session 的对话:\n\n${transcript}` },
  ]
}

// ─── Subtitle prompt: 切歌时一句字幕 (深夜电台口吻, ≤30字) ────────────

const SUBTITLE_SYSTEM = `你是一位深夜中文电台 DJ.
我会告诉你"听众刚切到的歌"和上下文, 你给出**一句字幕** (不是台词回复, 是显示在屏幕上的 caption).

要求:
- 中文, 1 句 ≤ 30 字 (含标点)
- 深夜电台口吻: 温柔 + 神秘感, 别太热情
- 称呼对面那位听众为"你"
- 用对方的喜好/记忆来个性化 (但不要照搬列点, 不要点名时间日期)
- 听众主动点的歌 (userInitiated=true): "好" / "点的是..." 这种承接感
- 自动续播 (userInitiated=false): "下面这首..." / "送你一首..." 串场感
- 上一首和当前歌都有时, 可以承接一下气氛 (但不强求)
- 输出格式: 纯中文文字; 不带 emoji / 表情符号 / 装饰性符号 / 列点 / 引号 / 控制标签 / 英文 (除歌名艺人) / 重复歌名解释

输出 JSON: { "text": "字幕文本" }`

export type SubtitleSongRef = {
  readonly title: string
  readonly artist: string
}

type SubtitleArgs = {
  readonly currentSong: SubtitleSongRef
  readonly previousSong?: SubtitleSongRef
  readonly userInitiated: boolean
  readonly longTerm?: readonly LongTermEntry[]
  readonly prefs?: UserPrefs
}

export function buildSubtitlePrompt(args: SubtitleArgs): readonly BrainMessage[] {
  const ctxLines = [
    `当前歌: ${args.currentSong.title} · ${args.currentSong.artist}`,
    args.previousSong !== undefined
      ? `刚刚那首: ${args.previousSong.title} · ${args.previousSong.artist}`
      : '刚开始, 没有上一首',
    `谁切的: ${args.userInitiated ? '听众主动点的' : '自动续播'}`,
  ]
  const ltBlock = formatLongTerm(args.longTerm)
  const prefsBlock = formatPrefs(args.prefs)
  const memBlock = [ltBlock, prefsBlock].filter((s): s is string => s !== null).join('\n\n')
  const userContent =
    memBlock.length > 0
      ? `${memBlock}\n\n# 这次场景\n${ctxLines.join('\n')}`
      : `# 这次场景\n${ctxLines.join('\n')}`
  return [
    { role: 'system', content: SUBTITLE_SYSTEM },
    { role: 'user', content: userContent },
  ]
}

// ─── 长期记忆段 ────────────────────────────────────────────────────────

// 最近 N 条 distill 进 prompt — 太多会撑 token, 老的优先丢
const LONG_TERM_CONTEXT_LIMIT = 12

function formatLongTerm(entries?: readonly LongTermEntry[]): string | null {
  if (entries === undefined || entries.length === 0) return null
  const recent = entries.slice(-LONG_TERM_CONTEXT_LIMIT)
  const lines = recent.map((e) => `- ${e.summary}`).join('\n')
  return `# 你已经认得的这位听众 (跨 session 累积的长期记忆, 顺时间排)\n${lines}\n\n用这些**自然地**问候/选歌, 但不要列出来给听众听, 也不要每条都引用.`
}

// 返回 null 表示无 prefs 可拼 (空文件 / 都没填) — 让调用方明确跳过这段, 不靠 '' 的隐式约定
function formatPrefs(prefs?: UserPrefs): string | null {
  if (prefs === undefined) return null
  const longTrim = prefs.longTerm.trim()
  const shortTrim = prefs.shortTerm.trim()
  if (longTrim === '' && shortTrim === '') return null
  const parts: string[] = ['# 这位听众的喜好 (用这些来挑歌/找话题, 但别复读)']
  if (longTrim !== '') {
    parts.push(`## 长期偏好\n${longTrim}`)
  }
  if (shortTrim !== '') {
    parts.push(`## 最近的状态\n${shortTrim}`)
  }
  return parts.join('\n\n')
}

function formatContext(ctx?: DjContext): string {
  return ['# 当下场景', formatCurrentSong(ctx), ...formatExtras(ctx)].join('\n')
}

function formatCurrentSong(ctx?: DjContext): string {
  if (ctx?.currentSong === undefined) return '当前没歌在放; 听众可能刚打开电台。'
  return `当前正放: ${ctx.currentSong.title} · ${ctx.currentSong.artists}`
}

function formatExtras(ctx?: DjContext): readonly string[] {
  if (ctx === undefined) return []
  const out: string[] = []
  if (ctx.queueLen !== undefined && ctx.queueLen > 0) {
    out.push(`队列还有 ${String(ctx.queueLen)} 首。`)
  }
  if (ctx.recentlySkipped !== undefined && ctx.recentlySkipped.length > 0) {
    out.push(`最近被跳过: ${ctx.recentlySkipped.slice(0, 3).join('、')}`)
  }
  if (ctx.weatherHint !== undefined && ctx.weatherHint.length > 0) {
    out.push(`外面: ${ctx.weatherHint}`)
  }
  return out
}
