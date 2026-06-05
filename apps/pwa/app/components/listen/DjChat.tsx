'use client'

// DjChat · M3 WS 流式版
// 之前 v1 走 HTTP request/response + 正则 dispatcher; 现在改成:
//   - 单 WS 连接 (useDjWs),mount 时连,unmount 时断
//   - typewriter 效果 (token 事件直接 append 到当前 dj 消息文本)
//   - audio 事件 → 队列播放 (SequentialAudioQueue, 见 dj-ws-client)
//   - action 事件 → kind=play 时 api.search 拿首歌喂 onPlay,kind=next 调 onNext
//
// 上下文构造: 传当前歌 / 队列长度给后端 (DJ 才能引用 "现在这首")

import { useCallback, useEffect, useRef, useState } from 'react'

import { api, type ApiSong } from '../../lib/api'
import { useDjWs, type DjAction, type DjStreamingMessage } from '../../lib/dj-ws-client'

import type { LanguageHook } from '../settings/useLanguage'
import type { DjContext } from '@claudio/shared/dj-ws'

type Props = {
  readonly open: boolean
  readonly onClose: () => void
  readonly onOpen: () => void
  readonly language: LanguageHook
  readonly onPlay: (song: ApiSong) => void
  readonly onNext: () => void
  // SceneStage 自己提供右下角触发器, 这里就别再渲染默认 💬 按钮了
  readonly hideTrigger?: boolean
  // 当前播放上下文 (传给 DJ 让她能 contextual 回话)
  readonly currentSong?: ApiSong
  readonly queueLen?: number
}

export function DjChat(props: Props) {
  return (
    <>
      {props.hideTrigger === true ? null : (
        <button
          type="button"
          className="dj-chat-trigger"
          onClick={props.open ? props.onClose : props.onOpen}
          aria-label={props.language.t('djTitle')}
          title={props.language.t('djTitle')}
        >
          {props.open ? '×' : '💬'}
        </button>
      )}
      {props.open ? <ChatPanel {...props} /> : null}
    </>
  )
}

function ChatPanel(props: Props) {
  const handleAction = useChatAction({ onPlay: props.onPlay, onNext: props.onNext })
  const dj = useDjWs({ enabled: props.open, onAction: handleAction })
  const ctx = buildContext(props)
  return (
    <PanelLayout
      language={props.language}
      onClose={props.onClose}
      messages={dj.state.messages}
      connected={dj.state.connected}
      streaming={dj.state.streaming}
      onSend={(text) => dj.sendUserMsg(text, ctx)}
      onCancel={dj.cancel}
    />
  )
}

function buildContext(props: Props): DjContext | undefined {
  if (props.currentSong === undefined && props.queueLen === undefined) return undefined
  // 一次性 literal 拼好, 不 mutate (避免 Object.assign 累积式 build 中途分支抛出留下半成品)
  return {
    ...(props.currentSong !== undefined && {
      currentSong: {
        id: props.currentSong.id,
        title: props.currentSong.title,
        artists: props.currentSong.artists.map((a) => a.name).join(' / '),
        ncmId: props.currentSong.ncmId,
      },
    }),
    ...(props.queueLen !== undefined && { queueLen: props.queueLen }),
  }
}

// ─── 面板布局 ────────────────────────────────────────────────────────────

type PanelLayoutProps = {
  readonly language: LanguageHook
  readonly onClose: () => void
  readonly messages: readonly DjStreamingMessage[]
  readonly connected: boolean
  readonly streaming: boolean
  readonly onSend: (text: string) => boolean
  readonly onCancel: () => void
}

function PanelLayout(p: PanelLayoutProps) {
  const { t } = p.language
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [p.messages])
  const submit = (): void => {
    const text = input.trim()
    if (text.length === 0 || p.streaming) return
    if (p.onSend(text)) setInput('')
  }
  return (
    <div className="dj-chat-panel" role="dialog" aria-label={t('djTitle')}>
      <ChatHeader
        title={t('djTitle')}
        closeLabel={t('settingsClose')}
        onClose={p.onClose}
        connected={p.connected}
      />
      <ChatList listRef={listRef} messages={p.messages} />
      <ChatForm
        inputRef={inputRef}
        placeholder={t('djInputPlaceholder')}
        sendLabel={p.streaming ? '取消' : t('djSend')}
        input={input}
        streaming={p.streaming}
        connected={p.connected}
        onChange={setInput}
        onSubmit={submit}
        onCancel={p.onCancel}
      />
    </div>
  )
}

function ChatHeader({
  title,
  closeLabel,
  onClose,
  connected,
}: {
  readonly title: string
  readonly closeLabel: string
  readonly onClose: () => void
  readonly connected: boolean
}) {
  return (
    <header className="dj-chat-header">
      <h3 className="dj-chat-title">{title}</h3>
      <span
        className={connected ? 'dj-chat-dot dj-chat-dot-on' : 'dj-chat-dot dj-chat-dot-off'}
        aria-hidden
      />
      <button type="button" onClick={onClose} className="dj-chat-close" aria-label={closeLabel}>
        ×
      </button>
    </header>
  )
}

function ChatList({
  listRef,
  messages,
}: {
  readonly listRef: React.RefObject<HTMLDivElement | null>
  readonly messages: readonly DjStreamingMessage[]
}) {
  return (
    <div ref={listRef} className="dj-chat-list">
      {messages.map((m) => (
        <div key={m.id} className={`dj-msg ${m.role === 'dj' ? 'dj-msg-dj' : 'dj-msg-user'}`}>
          {m.text}
          {m.streaming && m.text.length === 0 ? <span className="dj-msg-typing">…</span> : null}
        </div>
      ))}
    </div>
  )
}

function ChatForm({
  inputRef,
  placeholder,
  sendLabel,
  input,
  streaming,
  connected,
  onChange,
  onSubmit,
  onCancel,
}: {
  readonly inputRef: React.RefObject<HTMLInputElement | null>
  readonly placeholder: string
  readonly sendLabel: string
  readonly input: string
  readonly streaming: boolean
  readonly connected: boolean
  readonly onChange: (v: string) => void
  readonly onSubmit: () => void
  readonly onCancel: () => void
}) {
  return (
    <form
      className="dj-chat-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (streaming) onCancel()
        else onSubmit()
      }}
    >
      <input
        ref={inputRef}
        className="dj-chat-input"
        placeholder={connected ? placeholder : '连接中…'}
        value={input}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        disabled={!connected}
      />
      <button
        type="submit"
        disabled={!connected || (!streaming && input.trim().length === 0)}
        className="dj-chat-send"
      >
        {sendLabel}
      </button>
    </form>
  )
}

// ─── action 派发: kind=play 时 search + onPlay ──────────────────────────

type ActionHandlerArgs = {
  readonly onPlay: (s: ApiSong) => void
  readonly onNext: () => void
}

function useChatAction(args: ActionHandlerArgs): (action: DjAction) => void {
  // 用 ref 持有 callback,避免每次 render 都新建 onAction
  const ref = useRef(args)
  // args 本身是每次 render 新对象, 不能进 dep (会每帧触发 effect); 只 watch 内部 callback
  useEffect(() => {
    ref.current = args
  }, [args.onPlay, args.onNext])

  return useCallback((action: DjAction) => {
    void dispatchAction(action, ref.current)
  }, [])
}

async function dispatchAction(action: DjAction, handlers: ActionHandlerArgs): Promise<void> {
  if (action.kind === 'next') {
    handlers.onNext()
    return
  }
  if (action.query === undefined || action.query.length === 0) return
  try {
    const res = await api.search(action.query, 1)
    const song = res.songs[0]
    if (song === undefined) {
      // 查到 0 首歌 — 用户视角 DJ 说了播但没动. 也要留痕便于排查
      console.warn('[DjChat] dispatchAction: search returned 0 songs for', action.query)
      return
    }
    if (action.kind === 'play') handlers.onPlay(song)
    // 'queue' 也走 onPlay 暂时 — 真 enqueue 需要把 actions.queueSong 传进来,M3.1 再做
    if (action.kind === 'queue') handlers.onPlay(song)
  } catch (err: unknown) {
    // DANGEROUS-1 fix: search 失败必须留痕 — 否则 DJ 说了 "好的这就放" 但实际没放, 用户没任何反馈
    // 后续 M3.1 应把 error 通过 onError handler 反馈给 UI (toast 或 chat bubble)
    console.error('[DjChat] dispatchAction: search failed for', action.query, err)
  }
}
