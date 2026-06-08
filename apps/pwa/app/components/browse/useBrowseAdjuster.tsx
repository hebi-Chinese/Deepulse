// useBrowseAdjuster · ?adjust=browse 调试模式 — 拖天气 polygon 4 角
// 跟 Listen 同款两段式 → 单段 polygon 模型: canvas 满 viewport, polygon 直接 4 个 viewport 角
// 触发: URL 加 ?adjust=browse
// 操作:
//   1 / 2 / 3 / 4   选角 TL / TR / BR / BL (再按一次同号取消)
//   0               取消选角
//   方向键          移位 (Shift = 大步 1%, 默认 0.2%) — 没选角整体平移 4 个角, 选了只动那个
//   P               console.log + alert 当前 CSS, 用户定数后烧进 globals.css

import { useEffect, useRef, useState } from 'react'

type Corner = 'tl' | 'tr' | 'br' | 'bl'
type CornerPoint = { x: number; y: number } // viewport %
type BrowseVars = {
  corners: Record<Corner, CornerPoint>
  selected: Corner | null
}

// 跟 globals.css .browse-weather-canvas 的 var fallback 一致 — 用户 ?adjust=browse 拉定
// 旧两段式 (left 21.4, top -0.6, w 52.5, h 52.6) 换算后的 4 个 viewport 角 (退化为矩形)
const DEFAULT_VARS: BrowseVars = {
  corners: {
    tl: { x: 21.4, y: -0.6 },
    tr: { x: 73.9, y: -0.6 },
    br: { x: 73.9, y: 52 },
    bl: { x: 21.4, y: 52 },
  },
  selected: null,
}

export function useBrowseAdjuster(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const enabled = new URLSearchParams(window.location.search).get('adjust') === 'browse'
    if (!enabled) return
    setOn(true)
    // 深拷贝 corners 防污染模块级 default
    const vars: BrowseVars = {
      ...DEFAULT_VARS,
      corners: {
        tl: { ...DEFAULT_VARS.corners.tl },
        tr: { ...DEFAULT_VARS.corners.tr },
        br: { ...DEFAULT_VARS.corners.br },
        bl: { ...DEFAULT_VARS.corners.bl },
      },
    }
    const onKey = (e: KeyboardEvent): void => {
      if (handleAdjustKey(e, vars)) {
        e.preventDefault()
        applyBrowseVars(vars)
        // AtmosphereCanvas 用 inline px 锁了 canvas.style.width/height,
        // 优先级高于 CSS var, 所以光改 CSS 不够 — 派发 resize 让它重测重写
        window.dispatchEvent(new Event('resize'))
      }
    }
    applyBrowseVars(vars)
    document.documentElement.setAttribute('data-adjust-mode', 'browse')
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.removeAttribute('data-adjust-mode')
    }
  }, [])
  return on
}

function applyBrowseVars(v: BrowseVars): void {
  const r = document.documentElement
  ;(['tl', 'tr', 'br', 'bl'] as const).forEach((c) => {
    r.style.setProperty(`--browse-weather-${c}-x`, `${v.corners[c].x.toFixed(2)}%`)
    r.style.setProperty(`--browse-weather-${c}-y`, `${v.corners[c].y.toFixed(2)}%`)
  })
}

function handleAdjustKey(e: KeyboardEvent, v: BrowseVars): boolean {
  const step = e.shiftKey ? 1.0 : 0.2
  const corner = digitToCorner(e.code)
  if (corner !== undefined) {
    v.selected = v.selected === corner ? null : corner
    return true
  }
  if (e.code === 'Digit0' || e.code === 'Numpad0') {
    v.selected = null
    return true
  }
  if (handleMoveKey(e.key, v, step)) return true
  if (e.code === 'KeyP') {
    printBrowseVars(v)
    return true
  }
  return false
}

function digitToCorner(code: string): Corner | undefined {
  if (code === 'Digit1' || code === 'Numpad1') return 'tl'
  if (code === 'Digit2' || code === 'Numpad2') return 'tr'
  if (code === 'Digit3' || code === 'Numpad3') return 'br'
  if (code === 'Digit4' || code === 'Numpad4') return 'bl'
  return undefined
}

function handleMoveKey(key: string, v: BrowseVars, step: number): boolean {
  const dx = arrowDx(key, step)
  const dy = arrowDy(key, step)
  if (dx === 0 && dy === 0) return false
  if (v.selected !== null) {
    v.corners[v.selected].x += dx
    v.corners[v.selected].y += dy
  } else {
    for (const c of ['tl', 'tr', 'br', 'bl'] as const) {
      v.corners[c].x += dx
      v.corners[c].y += dy
    }
  }
  return true
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

function printBrowseVars(v: BrowseVars): void {
  const css = (['tl', 'tr', 'br', 'bl'] as const)
    .map(
      (c) =>
        `--browse-weather-${c}-x: ${v.corners[c].x.toFixed(1)}%; --browse-weather-${c}-y: ${v.corners[c].y.toFixed(1)}%;`,
    )
    .join(' ')
  // eslint-disable-next-line no-console -- intentional: dev adjust mode
  console.log('[browse-adjust]', css)
  window.alert(css)
}

// SVG 多边形 overlay — 跟 ListenWeatherOutline 同套, 描红虚线 + 4 角圆点
// 通过读 :root CSS var 实时更新, 监听 resize (hook 改 var 后会派 resize)
type CornerRefs = Record<Corner, SVGCircleElement | null>

function readCornerCoords(): Record<Corner, CornerPoint> {
  const r = document.documentElement
  const read = (name: string): number => parseFloat(r.style.getPropertyValue(name) || '0')
  return {
    tl: { x: read('--browse-weather-tl-x'), y: read('--browse-weather-tl-y') },
    tr: { x: read('--browse-weather-tr-x'), y: read('--browse-weather-tr-y') },
    br: { x: read('--browse-weather-br-x'), y: read('--browse-weather-br-y') },
    bl: { x: read('--browse-weather-bl-x'), y: read('--browse-weather-bl-y') },
  }
}

function paintOutline(
  poly: SVGPolygonElement | null,
  circles: CornerRefs,
  c: Record<Corner, CornerPoint>,
): void {
  const fmt = (n: number): string => n.toFixed(2)
  poly?.setAttribute(
    'points',
    `${fmt(c.tl.x)},${fmt(c.tl.y)} ${fmt(c.tr.x)},${fmt(c.tr.y)} ${fmt(c.br.x)},${fmt(c.br.y)} ${fmt(c.bl.x)},${fmt(c.bl.y)}`,
  )
  ;(['tl', 'tr', 'br', 'bl'] as const).forEach((k) => {
    const el = circles[k]
    if (el === null) return
    el.setAttribute('cx', fmt(c[k].x))
    el.setAttribute('cy', fmt(c[k].y))
  })
}

export function BrowseWeatherOutline() {
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
  return (
    <svg
      className="browse-weather-outline"
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
      {(['tl', 'tr', 'br', 'bl'] as const).map((k) => (
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
