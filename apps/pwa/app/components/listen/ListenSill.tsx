'use client'

// ListenSill · Listen 模式下的下半视图陈设
// 强制下半视口: 唱片 + 歌词 + viz + DJ 云 + DJ Chat 入口 + 浮控
// 上半视图依旧是房间窗户 (RoomScene 持续渲染),关窗动画由 [data-mode='listen'] 触发
// 内容**不出现在上半视口**,这是 v0.1.1 PRD 的硬约束

import { useEffect, useState } from 'react'

import { ImmersiveLyrics } from '../player/ImmersiveLyrics'
import { VinylRecord } from '../player/VinylRecord'
import { VizBars } from '../player/VizBars'

import { DjBreathCloud } from './DjBreathCloud'
import { DjChat } from './DjChat'
import { useDjCloud } from './useDjState'

import type { ApiSong } from '../../lib/api'
import type { LrcLine } from '../../lib/lrc'
import type { LanguageHook } from '../settings/useLanguage'

const HUD_HIDE_MS = 2400

type Props = {
  readonly audioRef: React.RefObject<HTMLAudioElement | null>
  readonly song: ApiSong | undefined
  readonly previousSong: ApiSong | undefined
  readonly playing: boolean
  readonly lrcLines: readonly LrcLine[]
  readonly lrcLoading: boolean
  readonly activeLrcIndex: number
  readonly userInitiatedTrack: boolean
  readonly language: LanguageHook
  readonly onTogglePlay: () => void
  readonly onPrev: () => void
  readonly onNext: () => void
  readonly onPlay: (s: ApiSong) => void
}

export function ListenSill(props: Props) {
  const hudVisible = useTransientHud()
  const djMsg = useDjCloud({
    currentSong: props.song,
    previousSong: props.previousSong,
    userInitiated: props.userInitiatedTrack,
    enabled: props.song !== undefined,
    lang: props.language.lang,
  })
  const [chatOpen, setChatOpen] = useState(false)
  return (
    <>
      <DjBreathCloud message={djMsg} />
      <ListenStage
        song={props.song}
        playing={props.playing}
        lrcLines={props.lrcLines}
        lrcLoading={props.lrcLoading}
        activeLrcIndex={props.activeLrcIndex}
      />
      <VizBars audioRef={props.audioRef} playing={props.playing} />
      <ListenHud
        visible={hudVisible}
        playing={props.playing}
        language={props.language}
        onTogglePlay={props.onTogglePlay}
        onPrev={props.onPrev}
        onNext={props.onNext}
      />
      <DjChat
        open={chatOpen}
        onOpen={() => {
          setChatOpen(true)
        }}
        onClose={() => {
          setChatOpen(false)
        }}
        language={props.language}
        onPlay={props.onPlay}
        onNext={props.onNext}
      />
    </>
  )
}

// 下半视图主区: 唱片 (上) + 歌词带 (底)
// 用独立 fixed 定位避免被 flex 压扁 (vinyl 必须保持正圆)
function ListenStage(p: {
  readonly song: ApiSong | undefined
  readonly playing: boolean
  readonly lrcLines: readonly LrcLine[]
  readonly lrcLoading: boolean
  readonly activeLrcIndex: number
}) {
  return (
    <>
      <div
        className="fixed left-1/2 -translate-x-1/2 z-30 pointer-events-none"
        style={{ top: 'calc(var(--win-top) + var(--win-h) + 32px)' }}
      >
        <VinylRecord song={p.song} playing={p.playing} />
      </div>
      <div
        className="fixed left-1/2 -translate-x-1/2 z-30 w-full max-w-3xl px-6 pointer-events-none"
        style={{ bottom: '140px' }}
      >
        <ImmersiveLyrics
          song={p.song}
          lines={p.lrcLines}
          loading={p.lrcLoading}
          activeIndex={p.activeLrcIndex}
        />
      </div>
    </>
  )
}

function useTransientHud(): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let timer = 0
    const show = (): void => {
      setVisible(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        setVisible(false)
      }, HUD_HIDE_MS)
    }
    window.addEventListener('pointermove', show, { passive: true })
    return () => {
      window.removeEventListener('pointermove', show)
      window.clearTimeout(timer)
    }
  }, [])
  return visible
}

type HudProps = {
  readonly visible: boolean
  readonly playing: boolean
  readonly language: LanguageHook
  readonly onTogglePlay: () => void
  readonly onPrev: () => void
  readonly onNext: () => void
}

function ListenHud(props: HudProps) {
  // 退出按钮 (⊘ 开窗) 已经由全局 WindowToggle 接管,放在左下角,
  // 跟 Browse 的 "关窗 ↘" 同位置同按钮统一体验。这里只剩 transport 浮控
  const { t } = props.language
  return (
    <div
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-6 px-6 py-2 rounded-full"
      style={{
        backdropFilter: 'blur(12px)',
        background: 'rgba(0,0,0,0.55)',
        opacity: props.visible ? 0.92 : 0,
        pointerEvents: props.visible ? 'auto' : 'none',
        transition: 'opacity 240ms ease-out',
      }}
    >
      <HudBtn label={t('listen')} onClick={props.onPrev}>⏮</HudBtn>
      <HudBtn label={props.playing ? '⏸' : '▶'} onClick={props.onTogglePlay} primary>
        {props.playing ? '⏸' : '▶'}
      </HudBtn>
      <HudBtn label={t('listen')} onClick={props.onNext}>⏭</HudBtn>
    </div>
  )
}

function HudBtn({
  children,
  onClick,
  label,
  primary,
}: {
  readonly children: React.ReactNode
  readonly onClick: () => void
  readonly label: string
  readonly primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={
        primary === true
          ? 'text-2xl text-white w-10 h-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25'
          : 'text-xl text-white/80 hover:text-white'
      }
    >
      {children}
    </button>
  )
}
