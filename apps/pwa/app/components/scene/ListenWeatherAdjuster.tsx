'use client'

// ?adjust=listen 调试模式 (Listen 透视梯形 canvas) — 用户手按 1234 选角 +
// 方向键贴 listen-bg 斜窗户拉定 weather canvas 形状.
//
// 触发: URL 加 ?adjust=listen
// 操作:
//   方向键      移位 (Shift = 大步 1%, 默认 0.2%) — 没选角时整体平移 4 个角, 选了角只移那个
//   1 / 2 / 3 / 4   选角 TL / TR / BR / BL (再按一次同号取消)
//   0           取消选角
//   P           console.log + alert 当前 CSS
//
// 坐标系: viewport % (不是 box 内 % offset). canvas 满屏, polygon 直接定 4 个 viewport 点.

import { useEffect, useRef, useState } from 'react'

type Corner = 'tl' | 'tr' | 'br' | 'bl'
type CornerPoint = { x: number; y: number } // viewport %
type Corners = Record<Corner, CornerPoint>
type LWVars = {
  corners: Corners
  selected: Corner | null
}

const ALL_CORNERS = ['tl', 'tr', 'br', 'bl'] as const

// 跟 globals.css .scene-weather-canvas 的 var fallback 一致 (viewport %)
// 用户 2026-06-05 手动校准, 贴 listen-bg.png 的窗户透视
const LW_DEFAULT: LWVars = {
  corners: {
    tl: { x: 8.7, y: -0.7 },
    tr: { x: 56.7, y: -0.6 },
    br: { x: 57.1, y: 50.6 },
    bl: { x: 8.3, y: 63.1 },
  },
  selected: null,
}

export function useListenWeatherAdjuster(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('adjust') !== 'listen') return
    setOn(true)
    // 深拷贝 corners — 防 vars.corners === LW_DEFAULT.corners 后续更新污染模块级 default
    let vars: LWVars = cloneVars(LW_DEFAULT)
    const onKey = (e: KeyboardEvent): void => {
      const next = handleLwKey(e, vars)
      if (next !== null) {
        e.preventDefault()
        vars = next
        applyLwVars(vars)
        // AtmosphereCanvas inline px 锁了 width/height, 必须重派 resize 才会重测
        window.dispatchEvent(new Event('resize'))
      }
    }
    applyLwVars(vars)
    document.documentElement.setAttribute('data-adjust-mode', 'listen')
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.removeAttribute('data-adjust-mode')
    }
  }, [])
  return on
}

function cloneVars(v: LWVars): LWVars {
  return {
    selected: v.selected,
    corners: {
      tl: { ...v.corners.tl },
      tr: { ...v.corners.tr },
      br: { ...v.corners.br },
      bl: { ...v.corners.bl },
    },
  }
}

function applyLwVars(v: LWVars): void {
  const r = document.documentElement
  for (const c of ALL_CORNERS) {
    r.style.setProperty(`--listen-weather-${c}-x`, `${v.corners[c].x.toFixed(2)}%`)
    r.style.setProperty(`--listen-weather-${c}-y`, `${v.corners[c].y.toFixed(2)}%`)
  }
}

function handleLwKey(e: KeyboardEvent, v: LWVars): LWVars | null {
  const step = e.shiftKey ? 1.0 : 0.2
  const corner = digitToCorner(e.code)
  if (corner !== undefined) {
    return { ...v, selected: v.selected === corner ? null : corner }
  }
  if (e.code === 'Digit0' || e.code === 'Numpad0') return { ...v, selected: null }
  const moved = applyLwMove(e.key, v, step)
  if (moved !== null) return moved
  if (e.code === 'KeyP') {
    printLwVars(v)
    return v
  }
  return null
}

function digitToCorner(code: string): Corner | undefined {
  if (code === 'Digit1' || code === 'Numpad1') return 'tl'
  if (code === 'Digit2' || code === 'Numpad2') return 'tr'
  if (code === 'Digit3' || code === 'Numpad3') return 'br'
  if (code === 'Digit4' || code === 'Numpad4') return 'bl'
  return undefined
}

function applyLwMove(key: string, v: LWVars, step: number): LWVars | null {
  const dx = arrowDx(key, step)
  const dy = arrowDy(key, step)
  if (dx === 0 && dy === 0) return null
  // 选了角只动那个角; 没选角整体平移 4 个角
  const corners =
    v.selected !== null ? moveOne(v.corners, v.selected, dx, dy) : moveAll(v.corners, dx, dy)
  return { ...v, corners }
}

function moveOne(corners: Corners, c: Corner, dx: number, dy: number): Corners {
  return { ...corners, [c]: { x: corners[c].x + dx, y: corners[c].y + dy } }
}
function moveAll(corners: Corners, dx: number, dy: number): Corners {
  return {
    tl: { x: corners.tl.x + dx, y: corners.tl.y + dy },
    tr: { x: corners.tr.x + dx, y: corners.tr.y + dy },
    br: { x: corners.br.x + dx, y: corners.br.y + dy },
    bl: { x: corners.bl.x + dx, y: corners.bl.y + dy },
  }
}

function arrowDx(key: string, step: number): number {
  if (key === 'ArrowLeft') return -step
  if (key === 'ArrowRight') return step
  return 0
}
function arrowDy(key: string, step: number): number {
  if (key === 'ArrowUp') return -step
  if (key === 'ArrowDown') return step
  return 0
}

function printLwVars(v: LWVars): void {
  const css = ALL_CORNERS.map(
    (c) =>
      `--listen-weather-${c}-x: ${v.corners[c].x.toFixed(1)}%; --listen-weather-${c}-y: ${v.corners[c].y.toFixed(1)}%;`,
  ).join(' ')
  // eslint-disable-next-line no-console -- intentional: dev adjust mode
  console.log('[listen-weather-adjust]', css)
  window.alert(css)
}

export function ListenWeatherAdjustHud() {
  return (
    <div className="adjust-hud" aria-hidden="true">
      <div>
        listen-weather adjust · <kbd>1234</kbd> pick corner · <kbd>0</kbd> all · <kbd>arrows</kbd>{' '}
        move · <kbd>shift</kbd> = big step · <kbd>P</kbd> print
      </div>
    </div>
  )
}

// SVG 多边形 overlay — 描红虚线梯形 + 4 角点圆圈, 通过读 :root CSS var 实时更新
// 监听 window resize (hook 改 var 后也派了 resize) 来重画
type CornerRefs = Record<Corner, SVGCircleElement | null>

function readCornerCoords(): Corners {
  const r = document.documentElement
  const read = (name: string): number => parseFloat(r.style.getPropertyValue(name) || '0')
  return {
    tl: { x: read('--listen-weather-tl-x'), y: read('--listen-weather-tl-y') },
    tr: { x: read('--listen-weather-tr-x'), y: read('--listen-weather-tr-y') },
    br: { x: read('--listen-weather-br-x'), y: read('--listen-weather-br-y') },
    bl: { x: read('--listen-weather-bl-x'), y: read('--listen-weather-bl-y') },
  }
}

function paintOutline(poly: SVGPolygonElement | null, circles: CornerRefs, c: Corners): void {
  const fmt = (n: number): string => n.toFixed(2)
  poly?.setAttribute(
    'points',
    `${fmt(c.tl.x)},${fmt(c.tl.y)} ${fmt(c.tr.x)},${fmt(c.tr.y)} ${fmt(c.br.x)},${fmt(c.br.y)} ${fmt(c.bl.x)},${fmt(c.bl.y)}`,
  )
  for (const k of ALL_CORNERS) {
    const el = circles[k]
    if (el === null) continue
    el.setAttribute('cx', fmt(c[k].x))
    el.setAttribute('cy', fmt(c[k].y))
  }
}

export function ListenWeatherOutline() {
  const polygonRef = useRef<SVGPolygonElement | null>(null)
  const circleRefs = useRef<CornerRefs>({ tl: null, tr: null, br: null, bl: null })
  useEffect(() => {
    const update = (): void => {
      paintOutline(polygonRef.current, circleRefs.current, readCornerCoords())
    }
    update()
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
    }
  }, [])
  // SVG 满 viewport, viewBox 0-100 直接对应 viewport %. overflow:visible 让负数/>100 也能画出来
  return (
    <svg
      className="listen-weather-outline"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon
        ref={polygonRef}
        fill="none"
        stroke="#ff3060"
        strokeWidth="0.6"
        strokeDasharray="2 1"
      />
      {ALL_CORNERS.map((k) => (
        <circle
          key={k}
          ref={(el) => {
            circleRefs.current[k] = el
          }}
          r="1.6"
          fill="#ff3060"
        />
      ))}
    </svg>
  )
}
