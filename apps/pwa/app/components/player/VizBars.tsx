'use client'

// VizBars · Listen 模式底部音频可视化条
// 48 条白 bar, 只朝上, 暂停时降回基线
// useAudioAnalyser 失败时 (bars === null) 显示静态呼吸条

import { useEffect, useState } from 'react'

import { useAudioAnalyser } from './useAudioAnalyser'

type Props = {
  readonly audioRef: React.RefObject<HTMLAudioElement | null>
  readonly playing: boolean
}

const BAR_COUNT = 48
const BAR_WIDTH = 3
const BAR_GAP = 4
const MAX_HEIGHT = 72
const BASELINE = 2

export function VizBars({ audioRef, playing }: Props) {
  const { bars } = useAudioAnalyser(audioRef)
  const fallbackBars = useFallbackBreath()
  // analyser 不可用就用呼吸 fallback
  const displayBars = bars ?? fallbackBars
  const totalWidth = BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * BAR_GAP

  return (
    <div
      aria-hidden="true"
      className="fixed bottom-0 left-1/2 z-20 -translate-x-1/2 flex items-end gap-1 pb-3 pointer-events-none"
      style={{ width: totalWidth, height: MAX_HEIGHT + 12 }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const v = displayBars[i] ?? 0
        const h = playing
          ? Math.max(BASELINE, (v / 255) * MAX_HEIGHT)
          : BASELINE
        return (
          <div
            key={i}
            className="rounded-sm transition-[height] duration-100 ease-out"
            style={{
              width: BAR_WIDTH,
              height: h,
              background:
                'linear-gradient(to top, oklch(94% 0.02 70 / 0.5), oklch(94% 0.02 70 / 1))',
            }}
          />
        )
      })}
    </div>
  )
}

// 静态呼吸 fallback: 48 个 bar 按 sin 波形上下,平均高度 ~30%
function useFallbackBreath(): readonly number[] {
  const [bars, setBars] = useState<readonly number[]>(() => Array<number>(BAR_COUNT).fill(0))
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (): void => {
      const t = (performance.now() - start) / 1000
      const next = Array.from({ length: BAR_COUNT }, (_, i) => {
        const phase = (i / BAR_COUNT) * Math.PI * 2 + t * 1.5
        return 60 + Math.sin(phase) * 40 // 范围 20-100,映射后约 8-40%
      })
      setBars(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [])
  return bars
}
