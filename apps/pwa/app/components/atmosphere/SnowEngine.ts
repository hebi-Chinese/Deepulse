// 雪景引擎 · 慢飘大片雪 + 摇摆相位
// v1 占位实现,后续可加堆积/吸光等

import type { AtmosphereEngine, Viewport } from './types'

type Flake = {
  x: number
  y: number
  r: number
  vy: number
  swayPhase: number
  swayAmp: number
  alpha: number
}

const FLAKES_PER_1000PX = 0.15

export function createSnowEngine(): AtmosphereEngine {
  const flakes: Flake[] = []
  let vp: Viewport = { width: 0, height: 0, dpr: 1 }
  let nowMs = 0

  return {
    init(viewport) {
      vp = viewport
      rebuild(flakes, vp)
    },
    resize(viewport) {
      vp = viewport
      rebuild(flakes, vp)
    },
    step(dtMs) {
      nowMs += dtMs
      const dt = dtMs / 1000
      for (const f of flakes) {
        f.y += f.vy * dt
        f.x += Math.sin(nowMs / 1000 + f.swayPhase) * f.swayAmp * dt
        if (f.y > vp.height + 10) {
          f.y = -10
          f.x = Math.random() * vp.width
        }
      }
    },
    draw(ctx) {
      // 主人 2026-06-06: 雪色跟雨同款冷蓝灰, 不要纯白发光, 夜色场景才协调
      for (const f of flakes) {
        ctx.fillStyle = `rgba(220,235,255,${String(f.alpha)})`
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
        ctx.fill()
      }
    },
    dispose() {
      flakes.length = 0
    },
  }
}

function rebuild(flakes: Flake[], vp: Viewport): void {
  flakes.length = 0
  const total = Math.round((vp.width * vp.height * FLAKES_PER_1000PX) / 1000)
  for (let i = 0; i < total; i++) {
    flakes.push({
      x: Math.random() * vp.width,
      y: Math.random() * vp.height,
      r: 0.8 + Math.random() * 2.4,
      vy: 30 + Math.random() * 60,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmp: 10 + Math.random() * 20,
      // alpha 范围跟雨 LAYER_ALPHAS (0.16/0.28/0.45) 对齐 — 夜色场景才不抢眼
      alpha: 0.18 + Math.random() * 0.27,
    })
  }
}
