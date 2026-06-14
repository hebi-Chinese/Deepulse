'use client'

// useDjWs · 浏览器侧 DJ 流式对话 WS 客户端
// 与后端 /api/dj/chat-ws 一一对应 (协议见 @deepulse/shared/dj-ws)
//
// 设计要点:
//   - 单连接,组件 mount 时 open,unmount 时 close
//   - 自动重连 (指数退避,最多 8 次)
//   - 消息派发用 reducer 风格,UI 只读 state
//   - 收 audio 事件就 enqueue (HTMLAudioElement, 顺序播放,不抢)
//   - sendUserMsg 失败 (未连接) 返回 false,UI 据此提示

import { wsServerMsgSchema } from '@deepulse/shared/dj-ws'
import { useCallback, useEffect, useRef, useState } from 'react'

import { duckMusic, restoreMusic } from '../components/player/sharedAudioCtx'

import { env } from './env'

import type { DjContext, WsClientMsg, WsServerMsg, DjActionKind } from '@deepulse/shared/dj-ws'

const MAX_RECONNECT_ATTEMPTS = 8
const RECONNECT_BASE_MS = 500
const PING_INTERVAL_MS = 25_000

export type DjStreamingMessage = {
  readonly id: string
  readonly role: 'user' | 'dj'
  readonly text: string
  readonly streaming: boolean
}

export type DjAction = { readonly kind: DjActionKind; readonly query?: string }

export type DjWsState = {
  readonly connected: boolean
  readonly messages: readonly DjStreamingMessage[]
  readonly streaming: boolean
}

export type UseDjWsOpts = {
  readonly onAction?: (action: DjAction) => void
  readonly enabled: boolean
}

export type DjWsApi = {
  readonly state: DjWsState
  readonly sendUserMsg: (text: string, context?: DjContext) => boolean
  readonly cancel: () => void
}

export function useDjWs(opts: UseDjWsOpts): DjWsApi {
  const [state, setState] = useState<DjWsState>(INITIAL_WS_STATE)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef({ attempts: 0, timer: 0 })
  const onActionRef = useRef(opts.onAction)
  const audioQueueRef = useRef(new SequentialAudioQueue())

  useEffect(() => {
    onActionRef.current = opts.onAction
  }, [opts.onAction])

  useConnectionLifecycle({
    enabled: opts.enabled,
    setState,
    wsRef,
    reconnectRef,
    audioQueueRef,
    onActionRef,
  })

  // 任何成功的开/收消息都重置重连计数
  useEffect(() => {
    if (state.connected) reconnectRef.current.attempts = 0
  }, [state.connected])

  const sendUserMsg = useCallback((text: string, context?: DjContext): boolean => {
    const msg: WsClientMsg =
      context !== undefined ? { type: 'user_msg', text, context } : { type: 'user_msg', text }
    const ok = sendRaw(wsRef.current, msg)
    if (!ok) return false
    setState((s) => appendUserAndPlaceholder(s, text))
    return true
  }, [])

  const cancel = useCallback(() => {
    sendRaw(wsRef.current, { type: 'cancel' })
  }, [])

  return { state, sendUserMsg, cancel }
}

const INITIAL_WS_STATE: DjWsState = { connected: false, messages: [], streaming: false }

function appendUserAndPlaceholder(s: DjWsState, text: string): DjWsState {
  return {
    ...s,
    streaming: true,
    messages: [
      ...s.messages,
      { id: rid(), role: 'user', text, streaming: false },
      { id: rid(), role: 'dj', text: '', streaming: true },
    ],
  }
}

type LifecycleArgs = {
  readonly enabled: boolean
  readonly setState: React.Dispatch<React.SetStateAction<DjWsState>>
  readonly wsRef: React.RefObject<WebSocket | null>
  readonly reconnectRef: React.RefObject<{ attempts: number; timer: number }>
  readonly audioQueueRef: React.RefObject<SequentialAudioQueue>
  readonly onActionRef: React.RefObject<((a: DjAction) => void) | undefined>
}

// 连接生命周期: open → 自动重连 → ping 心跳 → unmount cleanup
function useConnectionLifecycle(args: LifecycleArgs): void {
  const { enabled, setState, wsRef, reconnectRef, audioQueueRef, onActionRef } = args
  useEffect(() => {
    if (!enabled) return undefined
    const audioQueue = audioQueueRef.current
    const scheduleReconnect = (): void => {
      const r = reconnectRef.current
      if (r.attempts >= MAX_RECONNECT_ATTEMPTS) return
      r.attempts += 1
      window.clearTimeout(r.timer)
      r.timer = window.setTimeout(connect, RECONNECT_BASE_MS * 2 ** (r.attempts - 1))
    }
    function connect(): void {
      wsRef.current = openWs({
        url: buildWsUrl(),
        onState: setState,
        onAction: (a) => onActionRef.current?.(a),
        onAudio: (url) => {
          audioQueue.enqueue(url)
        },
        onClose: scheduleReconnect,
      })
    }
    connect()
    const pingTimer = window.setInterval(() => {
      sendRaw(wsRef.current, { type: 'ping' })
    }, PING_INTERVAL_MS)
    return () => {
      window.clearInterval(pingTimer)
      window.clearTimeout(reconnectRef.current.timer)
      wsRef.current?.close()
      wsRef.current = null
      audioQueue.stop()
    }
  }, [enabled, setState, wsRef, reconnectRef, audioQueueRef, onActionRef])
}

// ─── WS 打开 + 事件派发 ──────────────────────────────────────────────────

type OpenWsArgs = {
  readonly url: string
  readonly onState: React.Dispatch<React.SetStateAction<DjWsState>>
  readonly onAction: (a: DjAction) => void
  readonly onAudio: (url: string) => void
  readonly onClose: () => void
}

function openWs(args: OpenWsArgs): WebSocket {
  const ws = new WebSocket(args.url)
  ws.onopen = () => {
    args.onState((s) => ({ ...s, connected: true }))
  }
  ws.onmessage = (evt) => {
    let parsed: WsServerMsg
    try {
      const json: unknown = JSON.parse(String(evt.data))
      parsed = wsServerMsgSchema.parse(json)
    } catch (err: unknown) {
      // schema 漂移 / JSON 坏 → 丢这帧, 但留痕 — 否则 server 协议改了 dev/prod 都见不到
      console.warn('[dj-ws] discarded malformed frame:', String(evt.data).slice(0, 120), err)
      return
    }
    applyServerMsg(parsed, args)
  }
  ws.onclose = () => {
    args.onState((s) => ({ ...s, connected: false, streaming: false }))
    args.onClose()
  }
  ws.onerror = () => {
    // close 会跟着触发,这里不重复处理
  }
  return ws
}

function applyServerMsg(m: WsServerMsg, args: OpenWsArgs): void {
  switch (m.type) {
    case 'token':
      args.onState((s) => ({ ...s, messages: appendToken(s.messages, m.text) }))
      return
    case 'action':
      args.onAction(m.query !== undefined ? { kind: m.kind, query: m.query } : { kind: m.kind })
      return
    case 'audio':
      args.onAudio(m.url)
      return
    case 'reply_done':
      args.onState((s) => ({
        ...s,
        streaming: false,
        messages: finalizeLastDj(s.messages, m.fullReply),
      }))
      return
    case 'error':
      args.onState((s) => ({
        ...s,
        streaming: false,
        messages: finalizeLastDj(s.messages, `[出错: ${m.msg}]`),
      }))
      return
    // turn_start / sentence / pong: 仅用于诊断, UI 不需要单独处理
    case 'turn_start':
    case 'sentence':
    case 'pong':
      return
  }
}

function appendToken(
  messages: readonly DjStreamingMessage[],
  text: string,
): readonly DjStreamingMessage[] {
  const last = messages[messages.length - 1]
  if (last?.role !== 'dj' || !last.streaming) return messages
  return [...messages.slice(0, -1), { ...last, text: last.text + text }]
}

function finalizeLastDj(
  messages: readonly DjStreamingMessage[],
  fullText: string,
): readonly DjStreamingMessage[] {
  const last = messages[messages.length - 1]
  if (last?.role !== 'dj') return messages
  return [...messages.slice(0, -1), { ...last, text: fullText, streaming: false }]
}

function sendRaw(ws: WebSocket | null, msg: WsClientMsg): boolean {
  if (ws?.readyState !== WebSocket.OPEN) return false
  try {
    ws.send(JSON.stringify(msg))
    return true
  } catch (err: unknown) {
    // 罕见: JSON.stringify 转换循环引用, 或 ws.send 在 readyState 检查后被关
    // 调用方拿 false 只能区分"发了/没发", 不知道为啥 — 留痕区分协议崩 vs 偶发掉线
    console.warn('[dj-ws] sendRaw threw unexpectedly:', err)
    return false
  }
}

// ─── 音频队列: 一句一播, 不抢 ────────────────────────────────────────────

// queue idle → busy 转换时 duck 音乐, busy → idle 时 restore. 跨句子的间隙不抖动
// (一段 DJ 多句串场: 第一句进队列 duck, 最后一句 onended 队列真空才 restore)
class SequentialAudioQueue {
  private queue: string[] = []
  private current: HTMLAudioElement | null = null
  private stopped = false
  private isDucking = false

  enqueue(url: string): void {
    if (this.stopped) return
    this.queue.push(url)
    if (this.current === null) {
      this.startDuckIfNeeded()
      this.playNext()
    }
  }

  stop(): void {
    this.stopped = true
    this.queue = []
    if (this.current !== null) {
      this.current.pause()
      this.current.src = ''
      this.current = null
    }
    this.endDuckIfNeeded()
  }

  private playNext(): void {
    const next = this.queue.shift()
    if (next === undefined) {
      this.current = null
      this.endDuckIfNeeded()
      return
    }
    const audio = new Audio(next)
    audio.crossOrigin = 'anonymous'
    this.current = audio
    audio.onended = () => {
      this.playNext()
    }
    audio.onerror = () => {
      this.playNext()
    }
    void audio.play().catch(() => {
      // 自动播放被拦截 (新页面无用户手势) — 跳过这条,后续仍尝试
      this.playNext()
    })
  }

  private startDuckIfNeeded(): void {
    if (this.isDucking) return
    this.isDucking = true
    duckMusic()
  }

  private endDuckIfNeeded(): void {
    if (!this.isDucking) return
    this.isDucking = false
    restoreMusic()
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────

function buildWsUrl(): string {
  // env.serverUrl 形如 http://127.0.0.1:8787 → ws://127.0.0.1:8787/api/dj/chat-ws
  const base = env.serverUrl.replace(/^http/, 'ws')
  return `${base.replace(/\/$/, '')}/api/dj/chat-ws`
}

function rid(): string {
  return `${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
}
