'use client'

// ImmersiveLyrics · Listen 模式的大字歌词
// 跟传统 lrc 滚动列表不同: 只渲染 active ±2 行,active 居中
// active 满色亮; ±1 模糊 + 半透;±2 更弱;超出不渲染
// 无 LRC 时回落到歌名 + 歌手 + 呼吸

import type { ApiSong } from '../../lib/api'
import type { LrcLine } from '../../lib/lrc'

type Props = {
  readonly song: ApiSong | undefined
  readonly lines: readonly LrcLine[]
  readonly loading: boolean
  readonly activeIndex: number
}

const LINE_HEIGHT_EM = 2.4 // 行距

export function ImmersiveLyrics(props: Props) {
  if (props.song === undefined) {
    return <EmptyState />
  }
  if (props.loading) {
    return <LoadingState />
  }
  if (props.lines.length === 0) {
    return <NoLyricFallback song={props.song} />
  }
  return <Lines lines={props.lines} activeIndex={props.activeIndex} />
}

const LINES_CONTAINER_STYLE: React.CSSProperties = {
  fontFamily: '"Source Han Serif SC", "Songti SC", "Noto Serif SC", serif',
  fontWeight: 200,
  fontSize: 'clamp(1.75rem, 2.6vw, 3rem)',
  lineHeight: LINE_HEIGHT_EM,
  color: 'oklch(94% 0.02 70)',
  maxWidth: '60vw',
  transition: 'transform 600ms cubic-bezier(0.4, 0, 0.6, 1)',
}

function Lines({
  lines,
  activeIndex,
}: {
  readonly lines: readonly LrcLine[]
  readonly activeIndex: number
}) {
  const startIdx = Math.max(0, activeIndex - 2)
  const endIdx = Math.min(lines.length, activeIndex + 3)
  const visibleLines = lines.slice(startIdx, endIdx)

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="歌词"
      className="flex flex-col items-center text-center"
      style={LINES_CONTAINER_STYLE}
    >
      {visibleLines.map((line, i) => (
        <LyricLine
          key={`${String(startIdx + i)}-${String(line.timeMs)}`}
          text={line.text}
          offset={startIdx + i - activeIndex}
        />
      ))}
    </div>
  )
}

function LyricLine({ text, offset }: { readonly text: string; readonly offset: number }) {
  const isActive = offset === 0
  const distance = Math.abs(offset)
  // 透明度: active 1, ±1 0.3, ±2 0.12
  const opacity = isActive ? 1 : distance === 1 ? 0.3 : 0.12
  const blur = isActive ? 0 : Math.min(distance, 2)
  return (
    <div
      className="transition-all duration-500 ease-out"
      style={{
        opacity,
        filter: `blur(${String(blur)}px)`,
        letterSpacing: isActive ? '0.05em' : '0.02em',
        fontWeight: isActive ? 300 : 200,
        textShadow: isActive ? '0 0 8px rgba(255,255,255,0.18)' : 'none',
      }}
    >
      {text}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-white/30 font-light text-lg">还没选歌</div>
  )
}

function LoadingState() {
  return (
    <div className="text-white/40 font-light text-base animate-pulse">加载歌词中…</div>
  )
}

function NoLyricFallback({ song }: { readonly song: ApiSong }) {
  return (
    <div
      className="text-center text-white/90 font-light"
      style={{
        fontFamily: '"Source Han Serif SC", "Songti SC", serif',
        animation: 'lyric-breath-in 1.2s ease-out infinite alternate',
      }}
    >
      <div style={{ fontSize: 'clamp(2rem, 3vw, 3.5rem)' }}>{song.title}</div>
      <div className="mt-3 text-white/55" style={{ fontSize: 'clamp(1rem, 1.4vw, 1.5rem)' }}>
        {song.artists.map((a) => a.name).join(' · ')}
      </div>
    </div>
  )
}
