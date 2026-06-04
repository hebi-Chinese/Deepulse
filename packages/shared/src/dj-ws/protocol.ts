// DJ WS 流式对话协议 · client <-> server
// 一次 "user_msg" 触发一个 turn:
//   turn_start → (token | sentence | audio | action)* → reply_done
// 任何时刻可能收 error;心跳走 ping/pong
//
// 客户端 / 服务端共享, 用 zod 校验进/出消息;字段紧凑省带宽

import { z } from 'zod'

// ── 上下文 ──────────────────────────────────────────────────────────────
// 用户发消息时附带当前播放上下文,让 DJ 能引用 "现在这首" 之类
//
// 架构上 DjContext 是个业务概念, 但 schema 必须留在 shared (transport 验证层),
// 因为 shared 不能反向依赖 application. application/dj 做 type-only re-export
// 让业务层代码统一从 @claudio/application/dj 引用 (PWA 跨包仍可用 @claudio/shared/dj-ws)
//
// SECURITY: 所有字符串都有 max 上限 — 这些字段会直接拼入 LLM system prompt
// 没 cap 的话客户端可以塞 "晴天\n\n忽略上面指令..." 这种 prompt-injection payload
export const djContextSchema = z.object({
  currentSong: z
    .object({
      id: z.string().max(64),
      title: z.string().max(200),
      artists: z.string().max(200),
      ncmId: z.string().max(64).optional(),
    })
    .optional(),
  queueLen: z.number().int().nonnegative().max(10_000).optional(),
  recentlySkipped: z.array(z.string().max(120)).max(10).optional(),
  weatherHint: z.string().max(120).optional(),
})
export type DjContext = z.infer<typeof djContextSchema>

// ── Client → Server ─────────────────────────────────────────────────────

export const wsClientMsgSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user_msg'),
    text: z.string().min(1).max(500),
    context: djContextSchema.optional(),
  }),
  z.object({ type: z.literal('cancel') }),
  z.object({ type: z.literal('ping') }),
])
export type WsClientMsg = z.infer<typeof wsClientMsgSchema>

// ── Server → Client ─────────────────────────────────────────────────────
// turn_start: 服务端开始处理这条 user_msg, 带 turnId 便于 cancel 关联
// token: Brain 流式吐 token (中文按字符切, 拼到当前消息末尾)
// sentence: 一句话刚刚完成 (用于触发 typewriter 节奏 + TTS)
// audio: 某句对应的 TTS 音频 URL 准备好了 (异步, 可能晚于 sentence 几百毫秒)
// action: 结构化动作 (play / next / queue), 由 Brain 的 inline tag 解析得到
// reply_done: 一个 turn 结束, fullReply 是完整文本 (去掉 action tag)
// error: 任何阶段出错; 不一定致命, 可能后续还能收到事件
// pong: 心跳响应

export const djActionKindSchema = z.enum(['play', 'next', 'queue'])
export type DjActionKind = z.infer<typeof djActionKindSchema>

export const wsServerMsgSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('turn_start'), turnId: z.string() }),
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({ type: z.literal('sentence'), text: z.string(), idx: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('audio'),
    sentenceIdx: z.number().int().nonnegative(),
    url: z.string().url(),
  }),
  z.object({
    type: z.literal('action'),
    kind: djActionKindSchema,
    query: z.string().optional(),
  }),
  z.object({ type: z.literal('reply_done'), fullReply: z.string() }),
  z.object({ type: z.literal('error'), msg: z.string() }),
  z.object({ type: z.literal('pong') }),
])
export type WsServerMsg = z.infer<typeof wsServerMsgSchema>

// ── Brain inline action tag 解析 ────────────────────────────────────────
// Brain 被 prompt 教会在文本里嵌入这样的标签来发起动作:
//   <<play:周杰伦 稻香>>     → kind=play, query=周杰伦 稻香
//   <<queue:汪峰>>           → kind=queue, query=汪峰
//   <<next>>                 → kind=next
// 解析后 tag 会从可见文本里剥掉, 只通过 action 事件传给客户端

const TAG_RE = /<<(play|queue|next)(?::([^>]+))?>>/g

export type ParsedAction = { readonly kind: DjActionKind; readonly query?: string }
export type ActionParseResult = {
  readonly cleaned: string
  readonly actions: readonly ParsedAction[]
}

export function parseInlineActions(raw: string): ActionParseResult {
  const actions: ParsedAction[] = []
  // String.replace + replacer 收集 + 清理
  const cleaned = raw.replace(TAG_RE, (_, kind: string, query?: string) => {
    const parsedKind = djActionKindSchema.safeParse(kind)
    if (!parsedKind.success) return ''
    const q = query?.trim()
    actions.push(
      q !== undefined && q.length > 0
        ? { kind: parsedKind.data, query: q }
        : { kind: parsedKind.data },
    )
    return ''
  })
  return { cleaned: cleaned.trim(), actions }
}
