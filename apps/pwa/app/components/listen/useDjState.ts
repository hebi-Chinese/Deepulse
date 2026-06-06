'use client'

// useDjState · DJ 切歌字幕 — 走 brain + tts (跟 chat 同套大脑/嗓子)
//
// 流程:
//   1. currentSong.id 变化触发 fetch /api/dj/subtitle (返回 text + audioUrl)
//   2. brain 失败 / 返 null → fallback 到本地模板, 没 audio
//   3. 拿到 audio 就播 (走 ducking, 跟 DJ chat 同套), 同步显文本
//   4. audio 跑完 + 至少 CLOUD_HOLD_MS 才 fade-out 文本 (不让字幕比配音早消)

import { useEffect, useRef, useState } from 'react'

import { api, type ApiSong } from '../../lib/api'
import { duckMusic, restoreMusic } from '../player/sharedAudioCtx'

import type { Language } from '../../lib/i18n'

// 文本最少 hold 这么久 (没 audio 时纯靠这个) — 即使 audio 短也要让人看清
const CLOUD_HOLD_MS = 5400
const CLOUD_FADE_MS = 800

export type DjMessage = {
  readonly text: string
  readonly id: string
}

type Props = {
  readonly currentSong: ApiSong | undefined
  readonly previousSong: ApiSong | undefined
  readonly userInitiated: boolean
  readonly enabled: boolean
  readonly lang: Language
}

export function useDjCloud(props: Props): DjMessage | null {
  const [msg, setMsg] = useState<DjMessage | null>(null)
  const [fading, setFading] = useState(false)
  const lastId = useRef<string | null>(null)

  useEffect(() => {
    if (!props.enabled || props.currentSong === undefined) {
      setMsg(null)
      return
    }
    if (lastId.current === props.currentSong.id) return
    lastId.current = props.currentSong.id
    const { dispose } = startSubtitleFlow(props, setMsg, setFading)
    return dispose
    // props 整对象不进 deps — 它每帧都新, 会让 effect 每帧 re-fire,
    // setMsg(null) 误清字幕. 单字段已覆盖 effect 实际读的状态.
  }, [props.currentSong, props.previousSong, props.userInitiated, props.enabled, props.lang])

  if (msg === null) return null
  return fading ? { ...msg, id: `${msg.id}-fading` } : msg
}

type SubtitleResult = { text: string; audioUrl: string | null }

function startSubtitleFlow(
  props: Props,
  setMsg: (m: DjMessage | null) => void,
  setFading: (b: boolean) => void,
): { readonly dispose: () => void } {
  const song = props.currentSong
  if (song === undefined) return { dispose: () => undefined }
  const ctl = createFlowController(song.id, setMsg, setFading)
  void fetchSubtitle(props)
    .then((result) => {
      ctl.run(result ?? { text: localFallback(props), audioUrl: null })
    })
    .catch((err: unknown) => {
      // brain 挂了字幕得能跑 — 但 silent fallback 让我们在生产里完全见不到 brain 失败
      // 至少 console.warn 留痕, 主人 F12 能看到, 不影响 UI
      console.warn('[DJ subtitle] fetch failed, using local template:', err)
      ctl.run({ text: localFallback(props), audioUrl: null })
    })
  return { dispose: ctl.dispose }
}

type FlowController = {
  readonly run: (result: SubtitleResult) => void
  readonly dispose: () => void
}

// 把 "显文本 / 播 audio / hold / fade" 这套时序抽出来 — 函数 < 50 行 + 一个 flag 守 dispose
function createFlowController(
  songId: string,
  setMsg: (m: DjMessage | null) => void,
  setFading: (b: boolean) => void,
): FlowController {
  const state = { cancelled: false, t1: 0, t2: 0, audio: null as HTMLAudioElement | null }
  const duckCtl = createDuckController()
  const scheduleFade = (): void => {
    if (state.cancelled) return
    state.t1 = window.setTimeout(() => {
      if (!state.cancelled) setFading(true)
    }, CLOUD_HOLD_MS)
    state.t2 = window.setTimeout(() => {
      if (state.cancelled) return
      setMsg(null)
      setFading(false)
    }, CLOUD_HOLD_MS + CLOUD_FADE_MS)
  }
  return {
    run: (result) => {
      if (state.cancelled) return
      // id 用 song.id + Date.now() 拼 — React 用作 key, 同首歌触发新一轮字幕时
      // 强制 remount 让 fade-in 重跑. 这里 Date.now 是合理的 UI-key, 不是业务时间.
      setMsg({ text: result.text, id: `${songId}-${String(Date.now())}` })
      setFading(false)
      state.audio = playAudioWithDuck(result.audioUrl, duckCtl)
      scheduleFade()
    },
    dispose: () => {
      state.cancelled = true
      window.clearTimeout(state.t1)
      window.clearTimeout(state.t2)
      if (state.audio !== null) {
        state.audio.pause()
        state.audio.src = ''
        state.audio = null
      }
      duckCtl.endIfNeeded()
    },
  }
}

type DuckController = { start: () => void; endIfNeeded: () => void }

function createDuckController(): DuckController {
  let active = false
  return {
    start: () => {
      if (active) return
      active = true
      duckMusic()
    },
    endIfNeeded: () => {
      if (!active) return
      active = false
      restoreMusic()
    },
  }
}

function playAudioWithDuck(
  audioUrl: string | null,
  duckCtl: DuckController,
): HTMLAudioElement | null {
  if (audioUrl === null || audioUrl === '') return null
  duckCtl.start()
  const audio = new Audio(audioUrl)
  audio.crossOrigin = 'anonymous'
  audio.onended = () => {
    duckCtl.endIfNeeded()
  }
  audio.onerror = () => {
    duckCtl.endIfNeeded()
  }
  void audio.play().catch(() => {
    // autoplay 被拦 — 还原音乐, 文本照显
    duckCtl.endIfNeeded()
  })
  return audio
}

async function fetchSubtitle(props: Props): Promise<SubtitleResult | null> {
  const cur = props.currentSong
  if (cur === undefined) return null
  const body = {
    currentSong: { title: cur.title, artist: cur.artists.map((a) => a.name).join(' / ') },
    userInitiated: props.userInitiated,
    ...(props.previousSong !== undefined
      ? {
          previousSong: {
            title: props.previousSong.title,
            artist: props.previousSong.artists.map((a) => a.name).join(' / '),
          },
        }
      : {}),
  }
  const r = await api.djSubtitle(body)
  if (r.text === null) return null
  return { text: r.text, audioUrl: r.audioUrl }
}

// brain 失败时退回旧的本地模板抽签 — UI 不能因为后端挂就空
function localFallback(opts: Props): string {
  if (opts.currentSong === undefined) return ''
  return composeIntro({
    currentSong: opts.currentSong,
    previousSong: opts.previousSong,
    userInitiated: opts.userInitiated,
    lang: opts.lang,
  })
}

// ────────────────────────────────────────────────────────────────────────
// 文案生成 (纯函数,易测)

type ComposeOpts = {
  readonly currentSong: ApiSong
  readonly previousSong: ApiSong | undefined
  readonly userInitiated: boolean
  readonly lang: Language
}

const ZH_INTROS_USER: readonly string[] = [
  '好,放你的{title} · {artist}',
  '点的是{artist}的{title},来',
  '{title}—听过很多遍,但每次都不一样',
  '{artist}的歌,放',
]
const ZH_INTROS_AUTO: readonly string[] = [
  '接下来给你放{artist}的{title}',
  '雨天合适听这首—{title} · {artist}',
  '换一首{artist},{title}',
  '{artist}的{title},让它响一下',
]
const ZH_TRANSITIONS: readonly string[] = [
  '听完{prevTitle},接{title}',
  '{prevArtist}的余韵还在,来段{artist}',
  '上首是{prevTitle},现在这首{title}',
]
const EN_INTROS_USER: readonly string[] = [
  'Alright, your pick: {title} by {artist}',
  '{title} from {artist}, coming up',
  '{title} — never gets old',
]
const EN_INTROS_AUTO: readonly string[] = [
  'Next up, {title} by {artist}',
  'Rainy-day mood, this fits: {title} · {artist}',
  'Switching to {artist}, {title}',
]
const EN_TRANSITIONS: readonly string[] = [
  'After {prevTitle}, here is {title}',
  '{prevArtist} leaving, {artist} entering',
  'From {prevTitle} into {title}',
]

function composeIntro(opts: ComposeOpts): string {
  const titleNow = opts.currentSong.title
  const artistNow = opts.currentSong.artists.map((a) => a.name).join(' / ')
  const hasPrev = opts.previousSong !== undefined && opts.previousSong.id !== opts.currentSong.id
  const titlePrev = opts.previousSong?.title ?? ''
  const artistPrev = opts.previousSong?.artists.map((a) => a.name).join(' / ') ?? ''

  const pool = pickPool(opts.lang, hasPrev, opts.userInitiated)
  const template = pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? ''
  return template
    .replaceAll('{title}', titleNow)
    .replaceAll('{artist}', artistNow)
    .replaceAll('{prevTitle}', titlePrev)
    .replaceAll('{prevArtist}', artistPrev)
}

function pickPool(lang: Language, hasPrev: boolean, userInitiated: boolean): readonly string[] {
  if (lang === 'zh') {
    if (hasPrev && !userInitiated) return ZH_TRANSITIONS
    return userInitiated ? ZH_INTROS_USER : ZH_INTROS_AUTO
  }
  if (hasPrev && !userInitiated) return EN_TRANSITIONS
  return userInitiated ? EN_INTROS_USER : EN_INTROS_AUTO
}
