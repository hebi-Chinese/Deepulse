'use client'

// useDjState · DJ 切歌字幕 — 走 brain (跟 chat 同套大脑, 主人提的"DJ 是字幕贡献者")
//
// 流程:
//   1. currentSong.id 变化触发 fetch /api/dj/subtitle
//   2. brain 失败 / 返 null → fallback 到本地模板 (UI 不能空)
//   3. 文案落定后显示 CLOUD_HOLD_MS, 然后 fade-out CLOUD_FADE_MS

import { useEffect, useRef, useState } from 'react'

import { api, type ApiSong } from '../../lib/api'

import type { Language } from '../../lib/i18n'

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
  }, [props.currentSong, props.previousSong, props.userInitiated, props.enabled, props.lang, props])

  if (msg === null) return null
  return fading ? { ...msg, id: `${msg.id}-fading` } : msg
}

function startSubtitleFlow(
  props: Props,
  setMsg: (m: DjMessage | null) => void,
  setFading: (b: boolean) => void,
): { readonly dispose: () => void } {
  const song = props.currentSong
  if (song === undefined) return { dispose: () => undefined }
  let cancelled = false
  let t1 = 0
  let t2 = 0
  const showText = (text: string): void => {
    if (cancelled) return
    setMsg({ text, id: `${song.id}-${String(Date.now())}` })
    setFading(false)
    t1 = window.setTimeout(() => {
      if (!cancelled) setFading(true)
    }, CLOUD_HOLD_MS)
    t2 = window.setTimeout(() => {
      if (cancelled) return
      setMsg(null)
      setFading(false)
    }, CLOUD_HOLD_MS + CLOUD_FADE_MS)
  }
  void fetchSubtitle(props)
    .then((text) => {
      showText(text ?? localFallback(props))
    })
    .catch(() => {
      showText(localFallback(props))
    })
  return {
    dispose: () => {
      cancelled = true
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    },
  }
}

async function fetchSubtitle(props: Props): Promise<string | null> {
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
  return r.text
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
