// useAudioAnalyser · 把 <audio> ref 接到 Web Audio AnalyserNode
// 返回平滑后的 48 bar 频率数据 (log-scale 抽样)
// 失败 (CORS / 浏览器拒绝 / autoplay 限制) 时 bars 为 null,组件自己 fallback

import { useEffect, useRef, useState } from 'react'

const FFT_SIZE = 256
const USED_BINS = 64       // 取前 64 bin (0-11kHz),人耳关心范围
const BAR_COUNT = 48
const SMOOTHING = 0.7      // 低通: prev * 0.7 + new * 0.3

type State = {
  readonly bars: readonly number[] | null
  readonly active: boolean
}

type AnalyserRefs = {
  readonly mounted: { current: boolean }
  readonly analyser: { current: AnalyserNode | null }
  readonly smoothed: { current: Float32Array }
  readonly raf: { current: number }
}

export function useAudioAnalyser(audioRef: React.RefObject<HTMLAudioElement | null>): State {
  const [bars, setBars] = useState<readonly number[] | null>(null)
  const [active, setActive] = useState(false)
  const refs: AnalyserRefs = {
    mounted: useRef(false),
    analyser: useRef<AnalyserNode | null>(null),
    smoothed: useRef<Float32Array>(new Float32Array(BAR_COUNT)),
    raf: useRef(0),
  }

  useEffect(() => {
    const audio = audioRef.current
    if (audio === null) return
    const attach = (): void => {
      tryAttach(audio, refs, setActive, setBars)
    }
    audio.addEventListener('play', attach, { once: true })
    if (!audio.paused) attach()
    return () => {
      cancelAnimationFrame(refs.raf.current)
      audio.removeEventListener('play', attach)
    }
  }, [audioRef, refs])

  return { bars, active }
}

function tryAttach(
  audio: HTMLAudioElement,
  refs: AnalyserRefs,
  setActive: (v: boolean) => void,
  setBars: (v: readonly number[]) => void,
): void {
  if (refs.mounted.current) return
  try {
    const ctx = new AudioContext()
    const source = ctx.createMediaElementSource(audio)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = FFT_SIZE
    source.connect(analyser)
    analyser.connect(ctx.destination) // 别忘了接出去,否则静音
    refs.analyser.current = analyser
    refs.mounted.current = true
    setActive(true)
    startLoop(refs, setBars)
  } catch {
    setActive(false)
  }
}

function startLoop(refs: AnalyserRefs, setBars: (v: readonly number[]) => void): void {
  const analyser = refs.analyser.current
  if (analyser === null) return
  const freqData = new Uint8Array(analyser.frequencyBinCount)
  const tick = (): void => {
    analyser.getByteFrequencyData(freqData)
    const sampled = sampleLogScale(freqData)
    const smoothed = refs.smoothed.current
    const next = new Array<number>(BAR_COUNT)
    for (let i = 0; i < BAR_COUNT; i++) {
      const prev = smoothed[i] ?? 0
      const v = sampled[i] ?? 0
      const s = prev * SMOOTHING + v * (1 - SMOOTHING)
      smoothed[i] = s
      next[i] = s
    }
    setBars(next)
    refs.raf.current = requestAnimationFrame(tick)
  }
  refs.raf.current = requestAnimationFrame(tick)
}

// USED_BINS log-scale 重采样到 BAR_COUNT (低频密高频疏,贴近人耳)
function sampleLogScale(freqData: Uint8Array): number[] {
  const result = new Array<number>(BAR_COUNT)
  for (let i = 0; i < BAR_COUNT; i++) {
    const t = i / (BAR_COUNT - 1)
    const binIndex = Math.round(Math.pow(2, t * Math.log2(USED_BINS + 1)) - 1)
    const clamped = Math.min(USED_BINS - 1, Math.max(0, binIndex))
    result[i] = freqData[clamped] ?? 0
  }
  return result
}
