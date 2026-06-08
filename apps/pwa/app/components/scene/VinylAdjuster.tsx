'use client'

// ?adjust=vinyl 调试模式 — 用户手按方向键校准唱片在背景上的贴合位置.
// 触发: URL 加 ?adjust=vinyl
// 操作:
//   方向键      移位      (Shift+方向键 = 大步 1%, 默认 0.2%)
//   + / -       同比缩放
//   [ / ]       只调长轴 (横向)
//   , / .       只调短轴 (纵向)
//   P           console.log + alert 当前 CSS, 用户粘贴回 .scene-vinyl-wrap
//
// vars 用 useState 管 + 不可变更新 — 每次按键产生新对象, 不修改前一帧.

import { useEffect, useState } from 'react'

type VinylVars = {
  left: number // %
  top: number // %
  w: number // vw
  h: number // vw
}

const DEFAULT_VARS: VinylVars = { left: 56, top: 58, w: 11, h: 4.5 }
const HEIGHT_TO_WIDTH = DEFAULT_VARS.h / DEFAULT_VARS.w

export function useVinylAdjuster(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('adjust') !== 'vinyl') return
    setOn(true)
    let vars: VinylVars = { ...DEFAULT_VARS }
    const onKey = (e: KeyboardEvent): void => {
      const next = handleAdjustKey(e, vars)
      if (next !== null) {
        e.preventDefault()
        vars = next
        applyVinylVars(vars)
      }
    }
    applyVinylVars(vars)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  return on
}

function applyVinylVars(vars: VinylVars): void {
  const root = document.documentElement
  root.style.setProperty('--vinyl-left', `${vars.left.toFixed(2)}%`)
  root.style.setProperty('--vinyl-top', `${vars.top.toFixed(2)}%`)
  root.style.setProperty('--vinyl-w', `${vars.w.toFixed(2)}vw`)
  root.style.setProperty('--vinyl-h', `${vars.h.toFixed(2)}vw`)
}

// 返回新 vars 表示按键被处理; 返回 null 表示该键不归我管 (调用方就不 preventDefault)
function handleAdjustKey(e: KeyboardEvent, vars: VinylVars): VinylVars | null {
  const moveStep = e.shiftKey ? 1.0 : 0.2
  const sizeStep = e.shiftKey ? 0.5 : 0.1
  const moved = applyMove(e.key, vars, moveStep)
  if (moved !== null) return moved
  // 缩放键走 e.code 物理位置, 不受中文 IME 全角/半角影响
  const sized = applySize(e.code, vars, sizeStep)
  if (sized !== null) return sized
  if (e.code === 'KeyP') {
    printVinylVars(vars)
    return vars // 算"处理了"但 vars 没变
  }
  return null
}

function applyMove(key: string, vars: VinylVars, step: number): VinylVars | null {
  switch (key) {
    case 'ArrowLeft':
      return { ...vars, left: vars.left - step }
    case 'ArrowRight':
      return { ...vars, left: vars.left + step }
    case 'ArrowUp':
      return { ...vars, top: vars.top - step }
    case 'ArrowDown':
      return { ...vars, top: vars.top + step }
    default:
      return null
  }
}

function applySize(code: string, vars: VinylVars, step: number): VinylVars | null {
  const z = zoomDelta(code)
  if (z !== 0) return { ...vars, w: vars.w + step * z, h: vars.h + step * z * HEIGHT_TO_WIDTH }
  const wd = widthDelta(code)
  if (wd !== 0) return { ...vars, w: vars.w + step * wd }
  const hd = heightDelta(code)
  if (hd !== 0) return { ...vars, h: vars.h + step * hd }
  return null
}

// 用 e.code 物理位置 (Equal/Minus/...) 替代 e.key, 不受 IME 全角/半角影响
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

function printVinylVars(vars: VinylVars): void {
  const css = `--vinyl-left: ${vars.left.toFixed(1)}%; --vinyl-top: ${vars.top.toFixed(1)}%; --vinyl-w: ${vars.w.toFixed(2)}vw; --vinyl-h: ${vars.h.toFixed(2)}vw;`
  // eslint-disable-next-line no-console -- intentional: dev adjust mode
  console.log('[vinyl-adjust]', css)
  window.alert(css)
}

export function VinylAdjustHud() {
  return (
    <div className="adjust-hud" aria-hidden="true">
      <div>
        vinyl adjust · <kbd>arrows</kbd> move · <kbd>+/-</kbd> scale · <kbd>[/]</kbd> width ·{' '}
        <kbd>,/.</kbd> height · <kbd>shift</kbd> = big step · <kbd>P</kbd> print
      </div>
    </div>
  )
}
