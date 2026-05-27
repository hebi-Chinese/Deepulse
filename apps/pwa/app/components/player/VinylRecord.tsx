'use client'

// VinylRecord · Listen 模式底部中央的旋转唱片
// 视觉层 (底→上): 黑色基底 + 同心唱纹 + 圆形封面 + 暖金轴心
// 旋转: 12s linear infinite, paused 时停转
// 切歌: 待 v0.2 加入场动效 (rotate +30deg fade out → 换 cover → spring 回)

import type { ApiSong } from '../../lib/api'

type Props = {
  readonly song: ApiSong | undefined
  readonly playing: boolean
}

export function VinylRecord({ song, playing }: Props) {
  return (
    <div
      aria-label={song !== undefined ? `正在播放: ${song.title} · ${song.artists.map((a) => a.name).join(', ')}` : '唱片机'}
      role="img"
      className="relative rounded-full"
      style={{
        width: 'clamp(240px, 28vw, 360px)',
        height: 'clamp(240px, 28vw, 360px)',
        background: 'radial-gradient(circle at 35% 35%, oklch(15% 0 0) 0%, oklch(6% 0 0) 100%)',
        boxShadow:
          '0 0 60px oklch(82% 0.13 75 / 0.12), 0 24px 48px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.04)',
        animation: 'vinyl-spin 12s linear infinite',
        animationPlayState: playing ? 'running' : 'paused',
      }}
    >
      {/* 同心唱纹: 8 圈 */}
      <Grooves />
      {/* 圆形封面贴纸 (label) */}
      <CenterLabel song={song} />
      {/* 暖金轴心 */}
      <Spindle />
    </div>
  )
}

function Grooves() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {Array.from({ length: 8 }, (_, i) => {
        const r = 18 + i * 3.5
        return (
          <circle
            key={i}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="oklch(20% 0 0)"
            strokeWidth="0.15"
            opacity="0.4"
          />
        )
      })}
    </svg>
  )
}

function CenterLabel({ song }: { readonly song: ApiSong | undefined }) {
  // 中心圆标贴, 占盘面 40% 直径
  const labelSize = '40%'
  return (
    <div
      className="absolute top-1/2 left-1/2 rounded-full overflow-hidden"
      style={{
        width: labelSize,
        height: labelSize,
        transform: 'translate(-50%, -50%)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 12px rgba(0,0,0,0.4)',
        background: 'oklch(22% 0.04 50)',
      }}
    >
      {song?.coverUrl !== undefined ? (
        <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white/30 text-xs font-light">
          ○
        </div>
      )}
    </div>
  )
}

function Spindle() {
  return (
    <div
      className="absolute top-1/2 left-1/2 rounded-full"
      style={{
        width: 10,
        height: 10,
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(circle, oklch(80% 0.13 70) 0%, oklch(55% 0.10 60) 80%)',
        boxShadow: '0 0 4px rgba(0,0,0,0.6), inset 0 0 2px oklch(15% 0 0)',
      }}
      aria-hidden="true"
    />
  )
}
