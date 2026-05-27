// 雨景引擎 · 3 层视差雨 + 玻璃面板水滴 + 点击涟漪 + 鼠标风向
// 全 Canvas2D,无三方依赖
// 性能: 60 fps @ ~180 粒子 + ~20 droplet + ~6 ripple,modern device 完全胜任

import type { AtmosphereEngine, Pointer, RippleSpawn, Viewport } from './types'

type RainDrop = {
  x: number
  y: number
  /** 像素/秒下落速度 */
  vy: number
  /** 长度 (越远越短) */
  len: number
  /** 透明度 */
  alpha: number
  /** 层 (0=远 1=中 2=近),影响视差与厚度 */
  layer: 0 | 1 | 2
}

type GlassDroplet = {
  x: number
  y: number
  /** 半径(像素) */
  r: number
  /** 当前下滑速度 px/s, 静止时为 0 */
  vy: number
  /** 累计存活毫秒 (用于蒸发) */
  ageMs: number
  /** 上次合并时间 */
  lastMergeMs: number
}

type Ripple = {
  x: number
  y: number
  /** 当前半径 */
  r: number
  /** 起始时间 */
  startMs: number
}

// ─── 物理 / 视觉常量 ──────────────────────────────────────────────────────

const DROPS_PER_1000PX = 0.35 // 每 1000 px² 一滴 → 1920×1080 ≈ 720 滴
const LAYER_SPEEDS: readonly [number, number, number] = [200, 420, 700] // px/s
const LAYER_LENS: readonly [number, number, number] = [8, 14, 22]
const LAYER_ALPHAS: readonly [number, number, number] = [0.35, 0.55, 0.85]
const LAYER_WIDTHS: readonly [number, number, number] = [0.9, 1.3, 1.8]

const WIND_BASE_TILT = 0.12 // 默认风向 (右下倾)
const WIND_POINTER_GAIN = 0.4 // 鼠标 x 偏移对风向影响

const GLASS_TOP_RATIO = 0.18 // 上方 18% 是 hero 区,droplet 不生成
const GLASS_DROPLET_MIN_R = 2.0
const GLASS_DROPLET_MAX_R = 6.0
const GLASS_SPAWN_RATE = 18 // 每秒生成 droplet 数 (整屏)
const GLASS_DROPLET_LIMIT = 40
const GLASS_GRAVITY_THRESHOLD = 4.5 // r 大于此才开始下滑
const GLASS_GRAVITY = 280 // px/s² (slow,粘在玻璃上)
const GLASS_MERGE_DIST = 1.5 // 中心距 < (rA + rB) * 此倍数时合并
const GLASS_EVAPORATE_MS = 12_000

const RIPPLE_MAX_R = 220
const RIPPLE_DURATION_MS = 1100

// ─── 工厂 ────────────────────────────────────────────────────────────────

export function createRainEngine(): AtmosphereEngine {
  const drops: RainDrop[] = []
  const glass: GlassDroplet[] = []
  const ripples: Ripple[] = []
  let viewport: Viewport = { width: 0, height: 0, dpr: 1 }
  let glassSpawnAccumulator = 0
  let nowMs = 0

  return {
    init(vp) {
      viewport = vp
      rebuildDrops(drops, vp)
    },

    resize(vp) {
      viewport = vp
      rebuildDrops(drops, vp)
      // glass droplet 保留,但越界的剔除
      for (let i = glass.length - 1; i >= 0; i--) {
        const g = glass[i]
        if (g === undefined) continue
        if (g.x > vp.width || g.y > vp.height) glass.splice(i, 1)
      }
    },

    step(dtMs, pointer, newRipples) {
      const dt = dtMs / 1000
      nowMs += dtMs
      const tilt = WIND_BASE_TILT + pointerWind(pointer, viewport)
      stepDrops(drops, dt, tilt, viewport)
      stepGlass(glass, dt, dtMs)
      glassSpawnAccumulator += dtMs
      while (glassSpawnAccumulator > 1000 / GLASS_SPAWN_RATE) {
        glassSpawnAccumulator -= 1000 / GLASS_SPAWN_RATE
        spawnGlass(glass, viewport, nowMs)
      }
      mergeGlass(glass, nowMs)
      enqueueRipples(ripples, newRipples)
      stepRipples(ripples, nowMs)
    },

    draw(ctx, vp) {
      drawDrops(ctx, drops)
      drawRipples(ctx, ripples, nowMs)
      drawGlass(ctx, glass, nowMs, vp)
    },

    dispose() {
      drops.length = 0
      glass.length = 0
      ripples.length = 0
    },
  }
}

// ─── drops ────────────────────────────────────────────────────────────────

function rebuildDrops(drops: RainDrop[], vp: Viewport): void {
  drops.length = 0
  const total = Math.round((vp.width * vp.height * DROPS_PER_1000PX) / 1000)
  for (let i = 0; i < total; i++) {
    drops.push(makeDrop(vp, pickLayer(i, total)))
  }
}

function pickLayer(i: number, total: number): 0 | 1 | 2 {
  const t = i / Math.max(1, total)
  if (t < 0.4) return 0
  if (t < 0.75) return 1
  return 2
}

function makeDrop(vp: Viewport, layer: 0 | 1 | 2): RainDrop {
  return {
    x: Math.random() * vp.width,
    y: Math.random() * vp.height - vp.height, // 错开初始 y 防整齐落地
    vy: LAYER_SPEEDS[layer] * (0.85 + Math.random() * 0.3),
    len: LAYER_LENS[layer] * (0.8 + Math.random() * 0.5),
    alpha: LAYER_ALPHAS[layer],
    layer,
  }
}

function stepDrops(drops: RainDrop[], dt: number, tilt: number, vp: Viewport): void {
  for (const d of drops) {
    d.y += d.vy * dt
    d.x += d.vy * dt * tilt
    if (d.y > vp.height + d.len) {
      d.y = -d.len - Math.random() * 40
      d.x = Math.random() * vp.width
    }
    if (d.x > vp.width + 20) d.x -= vp.width + 40
    if (d.x < -20) d.x += vp.width + 40
  }
}

function drawDrops(ctx: CanvasRenderingContext2D, drops: readonly RainDrop[]): void {
  // lighter 合成模式: 雨滴亮色叠加,无论背景什么色调都明显可见 (模拟反光感)
  const prevOp = ctx.globalCompositeOperation
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (let layer = 0; layer < 3; layer++) {
    ctx.beginPath()
    ctx.lineWidth = LAYER_WIDTHS[layer as 0 | 1 | 2]
    ctx.strokeStyle = `rgba(220,235,255,${String(LAYER_ALPHAS[layer as 0 | 1 | 2])})`
    for (const d of drops) {
      if (d.layer !== layer) continue
      ctx.moveTo(d.x, d.y)
      ctx.lineTo(d.x - d.len * 0.15, d.y - d.len)
    }
    ctx.stroke()
  }
  ctx.globalCompositeOperation = prevOp
}

function pointerWind(pointer: Pointer, vp: Viewport): number {
  if (!pointer.inside || vp.width === 0) return 0
  // 鼠标在屏中心 → 0,左极 → -GAIN,右极 → +GAIN
  const centered = (pointer.x / vp.width - 0.5) * 2
  return centered * WIND_POINTER_GAIN
}

// ─── glass droplets ──────────────────────────────────────────────────────

function spawnGlass(glass: GlassDroplet[], vp: Viewport, atMs: number): void {
  if (glass.length >= GLASS_DROPLET_LIMIT) return
  glass.push({
    x: Math.random() * vp.width,
    y: GLASS_TOP_RATIO * vp.height + Math.random() * (vp.height * 0.7),
    r: GLASS_DROPLET_MIN_R + Math.random() * (GLASS_DROPLET_MAX_R - GLASS_DROPLET_MIN_R),
    vy: 0,
    ageMs: 0,
    lastMergeMs: atMs,
  })
}

function stepGlass(glass: GlassDroplet[], dt: number, dtMs: number): void {
  for (let i = glass.length - 1; i >= 0; i--) {
    const g = glass[i]
    if (g === undefined) continue
    g.ageMs += dtMs
    if (g.r >= GLASS_GRAVITY_THRESHOLD) {
      g.vy += GLASS_GRAVITY * dt
      g.y += g.vy * dt
    }
    // 蒸发: 大小逐渐缩,到 0 删
    const evapT = g.ageMs / GLASS_EVAPORATE_MS
    if (evapT >= 1) {
      glass.splice(i, 1)
      continue
    }
    if (evapT > 0.7) {
      g.r *= 0.997
    }
  }
}

function mergeGlass(glass: GlassDroplet[], atMs: number): void {
  for (let i = 0; i < glass.length; i++) {
    const a = glass[i]
    if (a === undefined) continue
    for (let j = i + 1; j < glass.length; j++) {
      const b = glass[j]
      if (b === undefined) continue
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.hypot(dx, dy)
      if (dist < (a.r + b.r) * GLASS_MERGE_DIST) {
        // 合并: 体积加,中心取加权,速度取最大
        const ra3 = a.r ** 3
        const rb3 = b.r ** 3
        a.r = Math.cbrt(ra3 + rb3)
        a.x = (a.x * ra3 + b.x * rb3) / (ra3 + rb3)
        a.y = (a.y * ra3 + b.y * rb3) / (ra3 + rb3)
        a.vy = Math.max(a.vy, b.vy)
        a.lastMergeMs = atMs
        glass.splice(j, 1)
        j--
      }
    }
  }
}

function drawGlass(
  ctx: CanvasRenderingContext2D,
  glass: readonly GlassDroplet[],
  atMs: number,
  vp: Viewport,
): void {
  for (const g of glass) {
    const evapT = g.ageMs / GLASS_EVAPORATE_MS
    const alpha = evapT < 0.8 ? 0.55 : 0.55 * (1 - (evapT - 0.8) / 0.2)
    // 主体: 浅色填充,模拟玻璃挂水
    const grad = ctx.createRadialGradient(g.x - g.r * 0.3, g.y - g.r * 0.3, 0, g.x, g.y, g.r)
    grad.addColorStop(0, `rgba(255,255,255,${String(alpha * 0.9)})`)
    grad.addColorStop(0.6, `rgba(180,210,240,${String(alpha * 0.4)})`)
    grad.addColorStop(1, `rgba(120,150,190,${String(alpha * 0.15)})`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2)
    ctx.fill()
    // 高光: 左上一点白
    ctx.fillStyle = `rgba(255,255,255,${String(alpha * 0.8)})`
    ctx.beginPath()
    ctx.arc(g.x - g.r * 0.35, g.y - g.r * 0.35, g.r * 0.18, 0, Math.PI * 2)
    ctx.fill()
    // 拖痕: 下滑时留一条淡尾
    if (g.vy > 30 && g.y < vp.height) {
      const tailLen = Math.min(60, g.vy * 0.05)
      const tail = ctx.createLinearGradient(g.x, g.y, g.x, g.y - tailLen)
      tail.addColorStop(0, `rgba(200,220,240,${String(alpha * 0.3)})`)
      tail.addColorStop(1, `rgba(200,220,240,0)`)
      ctx.fillStyle = tail
      ctx.fillRect(g.x - g.r * 0.6, g.y - tailLen, g.r * 1.2, tailLen)
    }
  }
}

// ─── ripples ─────────────────────────────────────────────────────────────

function enqueueRipples(ripples: Ripple[], spawns: readonly RippleSpawn[]): void {
  for (const s of spawns) {
    ripples.push({ x: s.x, y: s.y, r: 0, startMs: s.atMs })
  }
}

function stepRipples(ripples: Ripple[], atMs: number): void {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i]
    if (r === undefined) continue
    const t = (atMs - r.startMs) / RIPPLE_DURATION_MS
    if (t >= 1) {
      ripples.splice(i, 1)
      continue
    }
    // easeOutExpo 半径增长
    r.r = RIPPLE_MAX_R * (1 - 2 ** (-10 * t))
  }
}

function drawRipples(
  ctx: CanvasRenderingContext2D,
  ripples: readonly Ripple[],
  atMs: number,
): void {
  for (const r of ripples) {
    const t = (atMs - r.startMs) / RIPPLE_DURATION_MS
    const alpha = (1 - t) * 0.55
    ctx.strokeStyle = `rgba(200,220,255,${String(alpha)})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
    ctx.stroke()
    // 内圈次涟漪
    if (r.r > 30) {
      ctx.strokeStyle = `rgba(200,220,255,${String(alpha * 0.5)})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.r * 0.65, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}
