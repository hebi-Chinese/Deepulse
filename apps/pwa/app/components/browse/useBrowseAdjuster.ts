// useBrowseAdjuster · ?adjust=browse 调试模式 — 拖天气 canvas 矩形
// 控制 4 个 CSS var 写到 :root: --browse-weather-{left,top,w,h}
// 触发: URL 加 ?adjust=browse
// 操作:
//   方向键        移位      (Shift = 大步 1%, 默认 0.2%)
//   + / -         同比缩放   (Shift = 0.5%, 默认 0.1%)
//   [ / ]         只调宽
//   , / .         只调高
//   P             console.log + alert 当前 CSS, 主人定数后烧进 globals.css

import { useEffect, useState } from 'react'

type BrowseVars = {
  left: number // %
  top: number // %
  w: number // %
  h: number // %
}

const DEFAULT_VARS: BrowseVars = { left: 20, top: 5, w: 60, h: 45 }

export function useBrowseAdjuster(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const enabled = new URLSearchParams(window.location.search).get('adjust') === 'browse'
    if (!enabled) return
    setOn(true)
    const vars: BrowseVars = { ...DEFAULT_VARS }
    const onKey = (e: KeyboardEvent): void => {
      if (handleAdjustKey(e, vars)) {
        e.preventDefault()
        applyBrowseVars(vars)
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
  r.style.setProperty('--browse-weather-left', `${v.left.toFixed(2)}%`)
  r.style.setProperty('--browse-weather-top', `${v.top.toFixed(2)}%`)
  r.style.setProperty('--browse-weather-w', `${v.w.toFixed(2)}%`)
  r.style.setProperty('--browse-weather-h', `${v.h.toFixed(2)}%`)
}

function handleAdjustKey(e: KeyboardEvent, v: BrowseVars): boolean {
  // step 单位是 % (canvas 占视口比例大), 1.0 默认 / 3.0 shift 才看得出
  const moveStep = e.shiftKey ? 3 : 1
  const sizeStep = e.shiftKey ? 3 : 1
  // 方向键用 e.key (ArrowLeft 等不受 IME 影响)
  if (handleMoveKey(e.key, v, moveStep)) return true
  // 缩放键用 e.code (Equal/Minus/Bracket/Comma/Period 是物理键位置, 不受
  // 中文 IME 全角/半角影响 — 中文 Win 用户开全角时 + 会变 ＋ 跳过 e.key 检查)
  if (handleSizeKey(e.code, v, sizeStep)) return true
  if (e.code === 'KeyP') {
    printBrowseVars(v)
    return true
  }
  return false
}

function handleMoveKey(key: string, v: BrowseVars, step: number): boolean {
  switch (key) {
    case 'ArrowLeft':
      v.left -= step
      return true
    case 'ArrowRight':
      v.left += step
      return true
    case 'ArrowUp':
      v.top -= step
      return true
    case 'ArrowDown':
      v.top += step
      return true
    default:
      return false
  }
}

function handleSizeKey(key: string, v: BrowseVars, step: number): boolean {
  const z = zoomDelta(key)
  if (z !== 0) {
    v.w += step * z
    v.h += step * z
    return true
  }
  const wd = widthDelta(key)
  if (wd !== 0) {
    v.w += step * wd
    return true
  }
  const hd = heightDelta(key)
  if (hd !== 0) {
    v.h += step * hd
    return true
  }
  return false
}

// 用 e.code (物理键位置) — Equal/Minus 不受 Shift 影响 (= 和 + 同 code)
// 也兼容数字键盘 NumpadAdd / NumpadSubtract
function zoomDelta(code: string): -1 | 0 | 1 {
  if (code === 'Equal' || code === 'NumpadAdd') return 1
  if (code === 'Minus' || code === 'NumpadSubtract') return -1
  return 0
}
function widthDelta(code: string): -1 | 0 | 1 {
  if (code === 'BracketRight') return 1
  if (code === 'BracketLeft') return -1
  return 0
}
function heightDelta(code: string): -1 | 0 | 1 {
  if (code === 'Period') return 1
  if (code === 'Comma') return -1
  return 0
}

function printBrowseVars(v: BrowseVars): void {
  const css = `--browse-weather-left: ${v.left.toFixed(1)}%; --browse-weather-top: ${v.top.toFixed(1)}%; --browse-weather-w: ${v.w.toFixed(1)}%; --browse-weather-h: ${v.h.toFixed(1)}%;`
  // eslint-disable-next-line no-console -- intentional: dev adjust mode
  console.log('[browse-adjust]', css)
  window.alert(css)
}
