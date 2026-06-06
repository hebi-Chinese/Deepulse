// useAudioAnalyser · 把 <audio> ref 接到共享 AudioContext, 同时跑 analyser 旁路 tap
// 返回 ref-based bars 数据,VizBars 自己 rAF 读写 DOM,**不走 React state** (帧率太高会炸)
//
// 关键约束:
//   createMediaElementSource 把 audio 输出**永久**路由到 ctx.destination。
//   如果 ctx 是 suspended,即使 audio.paused=false 也没声音。
//   所以: 必须复用 sharedAudioCtx (unlock 已经在 gesture 内 resume 过的那个),
//   并且**只有 ctx 已 running 时才 attach**;否则放弃可视化保住声音。
//
// Routing (主人 2026-06-07 拍板 "视觉不跟 DJ 跳, ducking 可以做"):
//   source ─┬─→ musicGain ─→ destination   (听得到的路径, 受 ducking 控制)
//           └─→ analyser                    (旁路 tap, 不连 destination 不出声,
//                                            只用来读 FFT 给 VizBars)
//   这样 DJ 说话时 musicGain 滑到 0.25, 音乐变小;
//   analyser 看的是 source 原始信号 → 视觉雨/光跟实际音乐力度走, 不被 duck 拖累.

import { useEffect, useRef } from 'react'

import { getMusicGainNode, getSharedAudioCtx, isSharedAudioCtxRunning } from './sharedAudioCtx'

const FFT_SIZE = 256
const USED_BINS = 64
const BAR_COUNT = 48
const SMOOTHING = 0.7

export type BarsRef = { current: Float32Array }

export type AnalyserHandle = {
  readonly barsRef: BarsRef
  readonly isActive: () => boolean
}

// 已 attach 过的 audio 集合 — createMediaElementSource 一个 audio 元素只能调一次
const attachedAudios = new WeakSet<HTMLAudioElement>()
let sharedAnalyser: AnalyserNode | null = null

export function useAudioAnalyser(
  audioRef: React.RefObject<HTMLAudioElement | null>,
): AnalyserHandle {
  const barsRef = useRef<Float32Array>(new Float32Array(BAR_COUNT))
  const activeRef = useRef(false)

  useEffect(() => {
    const audio = audioRef.current
    if (audio === null) return undefined
    let stopLoop: (() => void) | null = null

    const tryAttach = (): void => {
      if (!isSharedAudioCtxRunning()) return
      const ctx = getSharedAudioCtx()
      if (ctx === null) return
      if (sharedAnalyser === null) {
        sharedAnalyser = ctx.createAnalyser()
        sharedAnalyser.fftSize = FFT_SIZE
        // 注意: analyser **不** connect(destination) — 它是旁路 tap.
        // 出声路径由 source → musicGain → destination 负责 (musicGain 自己接 destination).
      }
      const musicGain = getMusicGainNode()
      if (musicGain === null) return
      if (!attachedAudios.has(audio)) {
        try {
          const source = ctx.createMediaElementSource(audio)
          source.connect(musicGain) // 出声路径 (受 ducking 控制)
          source.connect(sharedAnalyser) // 旁路 tap (不出声, 只读 FFT)
          attachedAudios.add(audio)
        } catch {
          // 已 attach 过会抛 — 忽略
          return
        }
      }
      activeRef.current = true
      // 停掉旧 loop (StrictMode 双 mount / 同 audio 多次 play 不会累积 raf)
      stopLoop?.()
      stopLoop = startLoop(sharedAnalyser, barsRef)
    }

    const onPlay = (): void => {
      tryAttach()
    }
    audio.addEventListener('play', onPlay)
    if (!audio.paused) tryAttach()

    return () => {
      audio.removeEventListener('play', onPlay)
      stopLoop?.()
      activeRef.current = false
    }
  }, [audioRef])

  return {
    barsRef,
    isActive: () => activeRef.current,
  }
}

// 每次 attach 启一个 loop, 返回 stop. 闭包持 raf id, 不再用模块级单例
// (旧实现 activeRaf 是模块级, 多 instance / StrictMode 双 mount 会互相 cancel)
function startLoop(analyser: AnalyserNode, barsRef: BarsRef): () => void {
  const freqData = new Uint8Array(analyser.frequencyBinCount)
  const next = new Float32Array(BAR_COUNT)
  let raf = 0
  const tick = (): void => {
    analyser.getByteFrequencyData(freqData)
    const smoothed = barsRef.current
    for (let i = 0; i < BAR_COUNT; i++) {
      const t = i / (BAR_COUNT - 1)
      const binIndex = Math.round(Math.pow(2, t * Math.log2(USED_BINS + 1)) - 1)
      const clamped = Math.min(USED_BINS - 1, Math.max(0, binIndex))
      const raw = freqData[clamped] ?? 0
      const prev = smoothed[i] ?? 0
      next[i] = prev * SMOOTHING + raw * (1 - SMOOTHING)
    }
    barsRef.current.set(next)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(raf)
  }
}

export { BAR_COUNT }
