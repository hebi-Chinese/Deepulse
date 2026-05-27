'use client'

// WindowToggle · 统一的 "关窗/开窗" 按钮 — 永远在左下角
// Browse 时:"关窗 ↘" → 进 Listen
// Listen 时:"⊘ 开窗" → 退出 Listen
// 同位置同按钮,两个状态一致 — 而不是 Browse 关窗按钮在 NowPlaying 卡片内、
// Listen 开窗按钮在右下,体验割裂

import type { ViewMode } from '../player/useViewMode'
import type { LanguageHook } from '../settings/useLanguage'

type Props = {
  readonly mode: ViewMode
  readonly language: LanguageHook
  readonly onEnter: () => void
  readonly onExit: () => void
  readonly enterDisabled?: boolean
}

export function WindowToggle({ mode, language, onEnter, onExit, enterDisabled }: Props) {
  const { t } = language
  const isListen = mode === 'listen'
  const label = isListen ? `⊘  ${t('openWindow')}` : `${t('closeWindow')}  ↘`
  return (
    <button
      type="button"
      onClick={isListen ? onExit : onEnter}
      disabled={!isListen && enterDisabled === true}
      className="fixed bottom-6 left-6 z-50 px-4 py-2 rounded-full text-xs tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        fontFamily: '"Source Han Serif SC", "Songti SC", "Noto Serif SC", serif',
        background: 'oklch(95% 0 0 / 0.08)',
        border: '1px solid oklch(95% 0 0 / 0.14)',
        color: 'oklch(95% 0 0 / 0.78)',
        backdropFilter: 'blur(10px)',
      }}
      aria-label={isListen ? t('openWindow') : t('closeWindow')}
    >
      {label}
    </button>
  )
}
