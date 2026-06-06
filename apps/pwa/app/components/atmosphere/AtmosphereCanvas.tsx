'use client'

// AtmosphereCanvas · 全屏 fixed canvas + rAF 调度 + 引擎切换
// 鼠标移动 → pointer; 点击 → ripples (供雨景做水花用)
// 自动响应: prefers-reduced-motion / document.hidden / resize / dpr
// 不依赖 React 状态除开 weather prop,避免每帧 re-render

import { useEffect, useRef } from 'react'

import { createClearEngine } from './ClearEngine'
import { createRainEngine } from './RainEngine'
import { createSnowEngine } from './SnowEngine'

import type { AtmosphereEngine, Pointer, RippleSpawn, Viewport, Weather } from './types'

type Props = {
  readonly weather: Weather
  // 可选: 覆盖默认 "全屏 fixed inset:0 -z-10" 定位
  // 用于 Listen 模式把 canvas 限定到窗户区域 (尺寸=窗户尺寸, 粒子自动适配)
  readonly className?: string
  readonly style?: React.CSSProperties
}

const DEFAULT_CLASS = 'fixed inset-0 w-screen h-screen -z-10 pointer-events-none'

export function AtmosphereCanvas({ weather, className, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return

    if (reducedMotion()) {
      // 不动: 只画一个静态薄罩层就够
      drawStaticOverlay(ctx, canvas)
      return
    }

    const engine = createEngine(weather)
    const state = mountLoop(canvas, ctx, engine)
    return state.dispose
  }, [weather])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className ?? DEFAULT_CLASS}
      {...(style !== undefined ? { style } : {})}
    />
  )
}

// ─── 引擎工厂 ────────────────────────────────────────────────────────────

function createEngine(weather: Weather): AtmosphereEngine {
  switch (weather) {
    case 'rain':
      return createRainEngine()
    case 'snow':
      return createSnowEngine()
    case 'clear':
      return createClearEngine()
    default: {
      const exhaustive: never = weather
      throw new Error(`unknown weather: ${exhaustive as string}`)
    }
  }
}

// ─── 主循环 ──────────────────────────────────────────────────────────────

type LoopHandle = {
  readonly dispose: () => void
}

type MutablePointer = { x: number; y: number; inside: boolean }
type ViewportRef = { current: Viewport }

type LoopContext = {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly engine: AtmosphereEngine
  readonly pointer: MutablePointer
  readonly pendingRipples: RippleSpawn[]
  readonly viewportRef: ViewportRef
}

function mountLoop(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  engine: AtmosphereEngine,
): LoopHandle {
  const loopCtx: LoopContext = {
    canvas,
    ctx,
    engine,
    pointer: { x: 0, y: 0, inside: false },
    pendingRipples: [],
    viewportRef: { current: readViewport(canvas) },
  }
  syncCanvasSize(canvas, ctx, loopCtx.viewportRef.current)
  engine.init(loopCtx.viewportRef.current)
  const removeListeners = attachEvents(loopCtx)
  const stopLoop = startRafLoop(loopCtx)
  return {
    dispose: () => {
      stopLoop()
      removeListeners()
      engine.dispose()
    },
  }
}

function attachEvents(ctx: LoopContext): () => void {
  const onResize = (): void => {
    ctx.viewportRef.current = readViewport(ctx.canvas)
    syncCanvasSize(ctx.canvas, ctx.ctx, ctx.viewportRef.current)
    ctx.engine.resize(ctx.viewportRef.current)
  }
  const onPointerMove = (e: PointerEvent): void => {
    ctx.pointer.x = e.clientX
    ctx.pointer.y = e.clientY
    ctx.pointer.inside = true
  }
  const onPointerLeave = (): void => {
    ctx.pointer.inside = false
  }
  const onClick = (e: PointerEvent): void => {
    ctx.pendingRipples.push({ x: e.clientX, y: e.clientY, atMs: performance.now() })
  }
  window.addEventListener('resize', onResize)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerleave', onPointerLeave, { passive: true })
  // 用 capture,player 按钮可能 stopPropagation
  window.addEventListener('pointerdown', onClick, { capture: true, passive: true })
  return () => {
    window.removeEventListener('resize', onResize)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerleave', onPointerLeave)
    window.removeEventListener('pointerdown', onClick, { capture: true })
  }
}

function startRafLoop(loopCtx: LoopContext): () => void {
  let raf = 0
  let lastTs = 0
  const tick = (ts: number): void => {
    // 不用手动跳过 document.hidden: 浏览器后台自动把 rAF 节流到 1 fps,够省
    const dtMs = lastTs === 0 ? 16 : Math.min(48, ts - lastTs)
    lastTs = ts
    const snapshotPointer: Pointer = {
      x: loopCtx.pointer.x,
      y: loopCtx.pointer.y,
      inside: loopCtx.pointer.inside,
    }
    const ripplesCopy = loopCtx.pendingRipples.splice(0, loopCtx.pendingRipples.length)
    loopCtx.engine.step(dtMs, snapshotPointer, ripplesCopy)
    const vp = loopCtx.viewportRef.current
    loopCtx.ctx.clearRect(0, 0, vp.width, vp.height)
    loopCtx.engine.draw(loopCtx.ctx, vp)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(raf)
  }
}

// ─── viewport 工具 ───────────────────────────────────────────────────────

function readViewport(canvas: HTMLCanvasElement): Viewport {
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2) // dpr>2 没收益 + 吃 fps
  return { width: rect.width, height: rect.height, dpr }
}

function syncCanvasSize(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
): void {
  // 只写 bitmap pixel 尺寸 (canvas.width/height), 不再写 inline style.width/height —
  // 后者会覆盖外部 CSS class (比如 .browse-weather-canvas 的 var(--browse-weather-w)),
  // 导致 adjust 模式改 CSS var 时 canvas 不响应; CSS 决定 display 尺寸, JS 只决定 bitmap 密度
  canvas.width = Math.round(vp.width * vp.dpr)
  canvas.height = Math.round(vp.height * vp.dpr)
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0)
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function drawStaticOverlay(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.round(rect.width)
  canvas.height = Math.round(rect.height)
  ctx.fillStyle = 'rgba(20,30,50,0.15)'
  ctx.fillRect(0, 0, rect.width, rect.height)
}
