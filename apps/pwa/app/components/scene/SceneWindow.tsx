'use client'

// SceneWindow · 窗户内部覆盖层 — 只渲染**装饰**(风铃 + 雾 overlay)
// 雨/雪/玻璃水滴 由 AtmosphereCanvas (RainEngine/SnowEngine) 真粒子接管, 在 SceneStage 渲染
// 纯装饰, aria-hidden, 不接收交互

import type { Weather } from '../atmosphere/types'

const CHIMES = [
  { variant: 'c1' as const, size: { w: 40, h: 120 } },
  { variant: 'c2' as const, size: { w: 32, h: 90 } },
  { variant: 'c3' as const, size: { w: 28, h: 80 } },
]

export function SceneWindow({ weather }: { readonly weather: Weather }) {
  return (
    <div className="scene-window" aria-hidden="true">
      {CHIMES.map((c) => (
        <Chime key={c.variant} variant={c.variant} w={c.size.w} h={c.size.h} />
      ))}
      {weather === 'fog' ? <div className="scene-window-fog" /> : null}
    </div>
  )
}

// ─── 风铃 SVG ────────────────────────────────────────────────────────────
// 玻璃球 + 铃舌 + 短签 tanzaku, 不同 variant 用不同尺寸+晃动幅度 (在 CSS 里)

type ChimeProps = { readonly variant: 'c1' | 'c2' | 'c3'; readonly w: number; readonly h: number }

function Chime({ variant, w, h }: ChimeProps) {
  if (variant === 'c1') {
    return (
      <div className={`scene-chime ${variant}`}>
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${String(w)} ${String(h)}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="20" y1="0" x2="20" y2="55" stroke="rgba(220,200,170,0.45)" strokeWidth="0.8" />
          <ellipse
            cx="20"
            cy="65"
            rx="11"
            ry="10"
            fill="rgba(180,210,235,0.18)"
            stroke="rgba(220,235,250,0.4)"
            strokeWidth="0.7"
          />
          <path
            d="M 9 65 Q 9 78 20 78 Q 31 78 31 65"
            fill="rgba(180,210,235,0.15)"
            stroke="rgba(220,235,250,0.4)"
            strokeWidth="0.7"
          />
          <ellipse cx="16" cy="62" rx="3" ry="2.5" fill="rgba(245,250,255,0.45)" />
          <line x1="20" y1="78" x2="20" y2="92" stroke="rgba(200,180,150,0.4)" strokeWidth="0.6" />
          <circle cx="20" cy="80" r="2" fill="rgba(220,200,170,0.7)" />
          <rect x="17" y="92" width="6" height="22" fill="rgba(240,235,215,0.32)" rx="0.5" />
        </svg>
      </div>
    )
  }
  if (variant === 'c2') {
    return (
      <div className={`scene-chime ${variant}`}>
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${String(w)} ${String(h)}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="16" y1="0" x2="16" y2="42" stroke="rgba(220,200,170,0.45)" strokeWidth="0.7" />
          <ellipse
            cx="16"
            cy="50"
            rx="9"
            ry="8"
            fill="rgba(190,220,240,0.18)"
            stroke="rgba(220,235,250,0.4)"
            strokeWidth="0.6"
          />
          <path
            d="M 7 50 Q 7 60 16 60 Q 25 60 25 50"
            fill="rgba(190,220,240,0.15)"
            stroke="rgba(220,235,250,0.4)"
            strokeWidth="0.6"
          />
          <ellipse cx="13" cy="48" rx="2" ry="1.5" fill="rgba(245,250,255,0.4)" />
          <line x1="16" y1="60" x2="16" y2="70" stroke="rgba(200,180,150,0.4)" strokeWidth="0.5" />
          <circle cx="16" cy="62" r="1.5" fill="rgba(220,200,170,0.7)" />
          <rect x="13.5" y="70" width="5" height="18" fill="rgba(240,235,215,0.30)" rx="0.5" />
        </svg>
      </div>
    )
  }
  return (
    <div className={`scene-chime ${variant}`}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${String(w)} ${String(h)}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <line x1="14" y1="0" x2="14" y2="36" stroke="rgba(220,200,170,0.42)" strokeWidth="0.6" />
        <ellipse
          cx="14"
          cy="42"
          rx="7"
          ry="7"
          fill="rgba(195,225,245,0.18)"
          stroke="rgba(220,235,250,0.4)"
          strokeWidth="0.55"
        />
        <path
          d="M 7 42 Q 7 51 14 51 Q 21 51 21 42"
          fill="rgba(195,225,245,0.14)"
          stroke="rgba(220,235,250,0.4)"
          strokeWidth="0.55"
        />
        <ellipse cx="11" cy="40" rx="1.5" ry="1.2" fill="rgba(245,250,255,0.4)" />
        <line x1="14" y1="51" x2="14" y2="60" stroke="rgba(200,180,150,0.4)" strokeWidth="0.5" />
        <circle cx="14" cy="53" r="1.2" fill="rgba(220,200,170,0.65)" />
        <rect x="12" y="60" width="4" height="16" fill="rgba(240,235,215,0.28)" rx="0.4" />
      </svg>
    </div>
  )
}
