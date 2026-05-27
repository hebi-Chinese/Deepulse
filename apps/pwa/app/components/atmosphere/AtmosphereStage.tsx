'use client'

// AtmosphereStage · 包整页的背景层
// 结构 (z-index 从底到顶):
//   1. fixed gradient div  ← 时段 tint
//   2. AtmosphereCanvas    ← 天气粒子
//   3. children            ← 真正的 player UI (走玻璃面板样式)


import { AtmosphereCanvas } from './AtmosphereCanvas'
import { useTimeTint } from './useTimeTint'

import type { Weather } from './types'
import type { ReactNode } from 'react'

type Props = {
  readonly weather: Weather
  readonly children: ReactNode
}

export function AtmosphereStage({ weather, children }: Props) {
  const tint = useTimeTint()
  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-20 transition-[background] duration-[3000ms] ease-out"
        style={{ background: `linear-gradient(to bottom, ${tint.top}, ${tint.bottom})` }}
      />
      <AtmosphereCanvas weather={weather} />
      {children}
    </>
  )
}
