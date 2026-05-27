'use client'

// VolumeFloat · Listen 模式下的左下角音量浮控
// 配 WindowToggle 一起放在左下,user 实测 Listen 没法调音量
// 鼠标 hover 才展开 slider,平时只显示喇叭图标 (不抢视觉)

import { useState } from 'react'

type Props = {
  readonly volume: number
  readonly muted: boolean
  readonly onChange: (v: number) => void
  readonly onToggleMute: () => void
  readonly label: string
  readonly muteLabel: string
}

export function VolumeFloat({ volume, muted, onChange, onToggleMute, label, muteLabel }: Props) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      className="fixed bottom-6 left-32 z-50 flex items-center gap-2 px-3 py-2 rounded-full transition-all"
      style={{
        background: 'oklch(95% 0 0 / 0.08)',
        border: '1px solid oklch(95% 0 0 / 0.14)',
        backdropFilter: 'blur(10px)',
      }}
      onMouseEnter={() => {
        setExpanded(true)
      }}
      onMouseLeave={() => {
        setExpanded(false)
      }}
    >
      <button
        type="button"
        onClick={onToggleMute}
        className="text-white/75 hover:text-white text-sm leading-none"
        aria-label={muted ? muteLabel : label}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => {
          onChange(Number(e.target.value))
        }}
        aria-label={label}
        className="accent-white"
        style={{
          width: expanded ? 96 : 0,
          opacity: expanded ? 1 : 0,
          transition: 'width 220ms ease-out, opacity 180ms ease-out',
        }}
      />
    </div>
  )
}
