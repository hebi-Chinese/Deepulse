'use client'

// SceneVizBars · 音频可视化条 (示波器风格,上下镜像对称)
// 32 根细条放在 chip 右上角的木桌留白处
// 性能: 跟 player/VizBars 一样走 ref + 直接 style.height,不走 React state
// 没有 analyser 时用静态正弦 fallback (mockup 一致的"假律动")

import { useEffect, useRef } from 'react'

import { useAudioAnalyser, BAR_COUNT as ANALYSER_BAR_COUNT } from '../player/useAudioAnalyser'

const BAR_COUNT = 32 // 视觉上的条数 (< 分析器的 48,降采样取前 32 个)
const MAX_HEIGHT = 56 // bar 最大高度 (px)
const BASELINE = 4

type Props = {
  readonly audioRef: React.RefObject<HTMLAudioElement | null>
  readonly playing: boolean
}

export function SceneVizBars({ audioRef, playing }: Props) {
  const { barsRef, isActive } = useAudioAnalyser(audioRef)
  const barElsRef = useRef<HTMLDivElement[]>([])
  useVizLoop(barElsRef, barsRef, isActive, playing)
  return (
    <div className="scene-viz" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            if (el !== null) barElsRef.current[i] = el
          }}
          className="scene-viz-bar"
        />
      ))}
    </div>
  )
}

function useVizLoop(
  barElsRef: React.RefObject<HTMLDivElement[]>,
  barsRef: { current: Float32Array },
  isActive: () => boolean,
  playing: boolean,
): void {
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    // 分析器返回 48 条;视觉 32 条,均匀采样 stride
    const stride = ANALYSER_BAR_COUNT / BAR_COUNT
    const tick = (): void => {
      const els = barElsRef.current
      const useAnalyser = isActive()
      const t = (performance.now() - start) / 1000
      for (let i = 0; i < BAR_COUNT; i++) {
        const el = els[i]
        if (el === undefined) continue
        let h = BASELINE
        if (playing) {
          if (useAnalyser) {
            const srcIdx = Math.min(ANALYSER_BAR_COUNT - 1, Math.floor(i * stride))
            const v = barsRef.current[srcIdx] ?? 0
            h = Math.max(BASELINE, (v / 255) * MAX_HEIGHT)
          } else {
            // fallback: 两条不同频率的正弦叠加,看着像律动而不是单纯呼吸
            const phase1 = (i / BAR_COUNT) * Math.PI * 2 + t * 1.5
            const phase2 = (i / BAR_COUNT) * Math.PI * 4 + t * 2.3
            h = Math.max(BASELINE, 18 + Math.sin(phase1) * 14 + Math.sin(phase2) * 8)
          }
        }
        el.style.height = `${String(h)}px`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [barElsRef, barsRef, isActive, playing])
}
