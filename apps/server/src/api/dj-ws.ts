/* eslint-disable @typescript-eslint/require-await -- Fastify plugin signature is async */
// DJ WS · 流式对话端点 GET /api/dj/chat-ws
// 这层只做 WS framing: parse 进来的 msg → 调 runDjTurn use case → translate events 到 WS frame
// 所有业务编排都在 application/use-cases/dj/run-dj-turn.ts (architect audit CRITICAL fix)
//
// 关键不变量:
//   - 一次只跑一个 turn (新 user_msg 来了就 abort 旧的)
//   - 任何阶段错误都包成 'error' 事件发给客户端, WS 不立刻关
//   - turn slot immutable swap, 不在原对象 mutate

import { runDjTurn, type DjTurnEvent, type UseCaseLogger } from '@deepulse/application'
import { wsClientMsgSchema } from '@deepulse/shared/dj-ws'

import type { Container } from '../composition.js'
import type { WsClientMsg, WsServerMsg } from '@deepulse/shared/dj-ws'
import type { WebSocket } from '@fastify/websocket'
import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify'

type RawData = Buffer | ArrayBuffer | readonly Buffer[]

// 服务端兜底: brain 卡死 / TTS 不返回时, turn 自爆, WS 不被一个回合永久占住
const TURN_TIMEOUT_MS = 90_000

function rawToString(raw: RawData): string {
  if (Buffer.isBuffer(raw)) return raw.toString('utf-8')
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf-8')
  return Buffer.concat(raw).toString('utf-8')
}

// TurnSlot 内字段全 readonly, 切 turn 时整个 immutable swap
type TurnSlot = {
  readonly abortCtl: AbortController | null
  readonly turnSeq: number
}
type ConnState = { current: TurnSlot }

type ConnCtx = {
  readonly socket: WebSocket
  readonly state: ConnState
  readonly container: Container
  readonly log: FastifyBaseLogger
}

export function createDjWsPlugin(container: Container): FastifyPluginAsync {
  return async (app) => {
    app.get('/api/dj/chat-ws', { websocket: true }, (socket, req) => {
      const log = req.log.child({ scope: 'dj-ws' })
      const state: ConnState = { current: { abortCtl: null, turnSeq: 0 } }
      const ctx: ConnCtx = { socket, state, container, log }

      socket.on('message', (raw: RawData) => {
        const parsed = parseInbound(raw, socket)
        if (parsed === null) return
        handleClientMsg(parsed, ctx).catch((err: unknown) => {
          log.error({ err }, 'turn handler crashed')
          send(socket, { type: 'error', msg: errMsg(err) })
        })
      })

      // 必须挂 'error' listener — Node EventEmitter 没监听者会把 error 当 uncaught throw, 整个进程崩
      socket.on('error', (err: Error) => {
        log.error({ err }, 'ws socket error')
      })

      socket.on('close', () => {
        state.current.abortCtl?.abort()
        log.info('ws closed')
      })
    })
  }
}

function parseInbound(raw: RawData, socket: WebSocket): WsClientMsg | null {
  try {
    const json: unknown = JSON.parse(rawToString(raw))
    return wsClientMsgSchema.parse(json)
  } catch (err) {
    send(socket, { type: 'error', msg: `bad client msg: ${errMsg(err)}` })
    return null
  }
}

async function handleClientMsg(msg: WsClientMsg, ctx: ConnCtx): Promise<void> {
  if (msg.type === 'ping') {
    send(ctx.socket, { type: 'pong' })
    return
  }
  if (msg.type === 'cancel') {
    ctx.state.current.abortCtl?.abort()
    ctx.log.debug('user cancelled turn')
    return
  }
  // user_msg → 新 turn, abort 上一个, immutable swap 整个 slot
  const prev = ctx.state.current
  prev.abortCtl?.abort()
  const newCtl = new AbortController()
  const nextSeq = prev.turnSeq + 1
  ctx.state.current = { abortCtl: newCtl, turnSeq: nextSeq }
  const turnId = `t${String(nextSeq)}-${String(ctx.container.clock.nowMs())}`
  // 服务端兜底超时: brain/TTS 卡死也会自动 abort, 让 WS 不被永久挂死
  const timeoutId = setTimeout(() => {
    newCtl.abort()
    ctx.log.warn({ turnId, timeoutMs: TURN_TIMEOUT_MS }, 'turn timed out, aborting')
  }, TURN_TIMEOUT_MS)
  try {
    await runTurnAndEmit(msg, turnId, newCtl.signal, ctx)
  } finally {
    clearTimeout(timeoutId)
  }
}

// 调 runDjTurn use case, 把 DjTurnEvent 翻译成 WsServerMsg 帧
async function runTurnAndEmit(
  msg: Extract<WsClientMsg, { type: 'user_msg' }>,
  turnId: string,
  signal: AbortSignal,
  ctx: ConnCtx,
): Promise<void> {
  const ucLog: UseCaseLogger = {
    warn: (m: string, err?: unknown) => {
      ctx.log.warn({ err }, m)
    },
    debug: (m: string) => {
      ctx.log.debug(m)
    },
  }
  const events = runDjTurn(
    {
      brain: ctx.container.brain,
      tts: ctx.container.tts,
      conversations: ctx.container.conversations,
      shortTerm: ctx.container.shortTerm,
      longTerm: ctx.container.longTerm,
      userPrefs: ctx.container.userPrefs,
      clock: ctx.container.clock,
      log: ucLog,
    },
    {
      turnId,
      userText: msg.text,
      signal,
      ...(msg.context !== undefined ? { context: msg.context } : {}),
    },
  )
  for await (const ev of events) send(ctx.socket, eventToFrame(ev))
}

function eventToFrame(ev: DjTurnEvent): WsServerMsg {
  switch (ev.type) {
    case 'turn_start':
      return { type: 'turn_start', turnId: ev.turnId }
    case 'token':
      return { type: 'token', text: ev.text }
    case 'sentence':
      return { type: 'sentence', idx: ev.idx, text: ev.text }
    case 'audio':
      return { type: 'audio', sentenceIdx: ev.sentenceIdx, url: ev.url }
    case 'action':
      return ev.action.query !== undefined
        ? { type: 'action', kind: ev.action.kind, query: ev.action.query }
        : { type: 'action', kind: ev.action.kind }
    case 'reply_done':
      return { type: 'reply_done', fullReply: ev.fullReply }
    case 'error':
      return { type: 'error', msg: ev.msg }
  }
}

function send(socket: WebSocket, msg: WsServerMsg): void {
  if (socket.readyState !== socket.OPEN) return
  try {
    socket.send(JSON.stringify(msg))
  } catch {
    // EPIPE / ECONNRESET: 对端已死, 没必要再 propagate (catch 调用方也会再 send error 帧, 又抛一次)
  }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
