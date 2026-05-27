'use client'

// ListenMode · 全屏沉浸模态层
// 覆盖一切 Browse chrome (Listen mode 时由 Player 控制只渲染这层)
// 内容: 大字歌词 (上) + 唱片 (中下) + viz bars (底) + 退出 affordance
// 鼠标动一下浮出最小控件,2s 无动作淡出 (类似 YouTube 全屏)

import { useEffect, useState } from 'react'


import { ImmersiveLyrics } from './ImmersiveLyrics'
import { VinylRecord } from './VinylRecord'
import { VizBars } from './VizBars'

import type { ApiSong } from '../../lib/api'
import type { LrcLine } from '../../lib/lrc'

const CONTROLS_HIDE_MS = 2000

type Props = {
  readonly audioRef: React.RefObject<HTMLAudioElement | null>
  readonly song: ApiSong | undefined
  readonly playing: boolean
  readonly lrcLines: readonly LrcLine[]
  readonly lrcLoading: boolean
  readonly activeLrcIndex: number
  readonly onTogglePlay: () => void
  readonly onPrev: () => void
  readonly onNext: () => void
  readonly onExit: () => void
}

export function ListenMode(props: Props) {
  const controlsVisible = useTransientControls()

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col items-center justify-between py-12 px-6"
      style={{
        // 背景叠一层暗化 (Listen 模式房间灯变暗 30%)
        background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.35) 90%)',
      }}
    >
      <TopBar song={props.song} />

      <div className="flex-1 flex items-center justify-center w-full">
        <ImmersiveLyrics
          song={props.song}
          lines={props.lrcLines}
          loading={props.lrcLoading}
          activeIndex={props.activeLrcIndex}
        />
      </div>

      <div className="flex flex-col items-center gap-6">
        <VinylRecord song={props.song} playing={props.playing} />
      </div>

      <VizBars audioRef={props.audioRef} playing={props.playing} />

      <TransientControls
        visible={controlsVisible}
        playing={props.playing}
        onTogglePlay={props.onTogglePlay}
        onPrev={props.onPrev}
        onNext={props.onNext}
      />

      <ExitAffordance onExit={props.onExit} />
    </div>
  )
}

// 顶部歌名,song 变化时重新进场,5s 后 fade out
function TopBar({ song }: { readonly song: ApiSong | undefined }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    setVisible(true)
    const t = setTimeout(() => {
      setVisible(false)
    }, 5000)
    return () => {
      clearTimeout(t)
    }
  }, [song?.id])
  if (song === undefined) return null
  return (
    <div
      className="text-center transition-opacity duration-700"
      style={{
        opacity: visible ? 1 : 0.18,
        fontFamily: '"Source Han Serif SC", serif',
      }}
    >
      <div className="text-white/75 text-sm tracking-widest">正在播放</div>
      <div className="mt-2 text-white text-xl font-light">
        {song.title} · {song.artists.map((a) => a.name).join(' / ')}
      </div>
    </div>
  )
}

// 鼠标动浮出 / 2s 静默淡出
function useTransientControls(): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let timer = 0
    const show = (): void => {
      setVisible(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        setVisible(false)
      }, CONTROLS_HIDE_MS)
    }
    window.addEventListener('pointermove', show, { passive: true })
    return () => {
      window.removeEventListener('pointermove', show)
      window.clearTimeout(timer)
    }
  }, [])
  return visible
}

type ControlsProps = {
  readonly visible: boolean
  readonly playing: boolean
  readonly onTogglePlay: () => void
  readonly onPrev: () => void
  readonly onNext: () => void
}

function TransientControls(props: ControlsProps) {
  return (
    <div
      className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 flex items-center gap-6 px-6 py-3 rounded-full"
      style={{
        backdropFilter: 'blur(12px)',
        background: 'rgba(0,0,0,0.35)',
        opacity: props.visible ? 0.85 : 0,
        pointerEvents: props.visible ? 'auto' : 'none',
        transition: 'opacity 200ms ease-out',
      }}
    >
      <button
        type="button"
        onClick={props.onPrev}
        className="text-xl text-white/80 hover:text-white"
        aria-label="上一首"
      >
        ⏮
      </button>
      <button
        type="button"
        onClick={props.onTogglePlay}
        className="text-2xl text-white w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        aria-label={props.playing ? '暂停' : '播放'}
      >
        {props.playing ? '⏸' : '▶'}
      </button>
      <button
        type="button"
        onClick={props.onNext}
        className="text-xl text-white/80 hover:text-white"
        aria-label="下一首"
      >
        ⏭
      </button>
    </div>
  )
}

function ExitAffordance({ onExit }: { readonly onExit: () => void }) {
  return (
    <button
      type="button"
      onClick={onExit}
      className="fixed bottom-6 right-6 z-40 text-xs text-white/45 hover:text-white/85 transition-colors tracking-widest"
      style={{ fontFamily: '"Source Han Serif SC", serif' }}
      aria-label="退出 Listen 模式"
    >
      ⊘  开窗
    </button>
  )
}
