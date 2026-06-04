'use client'

// SettingsPanel · 顶栏齿轮唤出的右侧抽屉
// 控制: 语言 / 天气 / 主题 (preview only) / 字体 (preview only)
// Esc 关 / 点遮罩关 / 点 X 关

import { useEffect } from 'react'

import { LANGUAGES, LANGUAGE_LABEL } from '../../lib/i18n'
import { WEATHERS } from '../atmosphere/types'

import { AccountSection } from './AccountSection'

import type { LanguageHook } from './useLanguage'
import type { Language } from '../../lib/i18n'
import type { Weather } from '../atmosphere/types'

type Props = {
  readonly open: boolean
  readonly onClose: () => void
  readonly language: LanguageHook
  readonly weather: Weather
  readonly onWeatherChange: (w: Weather) => void
}

export function SettingsPanel({ open, onClose, language, weather, onWeatherChange }: Props) {
  useEsc(open, onClose)
  if (!open) return null
  const { t } = language
  return (
    <>
      <div className="settings-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="settings-panel" role="dialog" aria-label={t('settings')}>
        <PanelHeader title={t('settings')} closeLabel={t('settingsClose')} onClose={onClose} />
        <PanelBody language={language} weather={weather} onWeatherChange={onWeatherChange} />
        <footer className="mt-auto pt-4 text-xs text-white/40">
          <p>Claudio · v0.1</p>
        </footer>
      </aside>
    </>
  )
}

function PanelHeader({
  title,
  closeLabel,
  onClose,
}: {
  readonly title: string
  readonly closeLabel: string
  readonly onClose: () => void
}) {
  return (
    <header className="flex items-center justify-between">
      <h2 className="text-white text-base font-light tracking-wider">{title}</h2>
      <button
        type="button"
        className="text-white/55 hover:text-white text-lg"
        onClick={onClose}
        aria-label={closeLabel}
      >
        ×
      </button>
    </header>
  )
}

function PanelBody({
  language,
  weather,
  onWeatherChange,
}: {
  readonly language: LanguageHook
  readonly weather: Weather
  readonly onWeatherChange: (w: Weather) => void
}) {
  const { lang, setLang, t } = language
  return (
    <>
      <AccountSection language={language} />
      <Group label={t('settingsLanguage')}>
        {LANGUAGES.map((l) => (
          <Pill
            key={l}
            active={l === lang}
            onClick={() => {
              setLang(l)
            }}
          >
            {LANGUAGE_LABEL[l]}
          </Pill>
        ))}
      </Group>
      <Group label={t('settingsWeather')}>
        {WEATHERS.map((w) => (
          <Pill
            key={w}
            active={w === weather}
            onClick={() => {
              onWeatherChange(w)
            }}
          >
            {weatherLabel(w, lang)}
          </Pill>
        ))}
      </Group>
      {/* Theme / Font 未实现,先不渲染,免得用户点 disabled 以为 "设置无效" */}
    </>
  )
}

function useEsc(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [active, onClose])
}

function Group({
  label,
  children,
}: {
  readonly label: string
  readonly children: React.ReactNode
}) {
  return (
    <section className="settings-group">
      <div className="settings-label">{label}</div>
      <div className="settings-pills">{children}</div>
    </section>
  )
}

function Pill({
  children,
  active,
  disabled,
  onClick,
}: {
  readonly children: React.ReactNode
  readonly active?: boolean
  readonly disabled?: boolean
  readonly onClick?: () => void
}) {
  return (
    <button
      type="button"
      className="settings-pill"
      aria-pressed={active === true ? 'true' : 'false'}
      onClick={onClick}
      disabled={disabled}
      data-disabled={disabled === true ? 'true' : undefined}
    >
      {children}
    </button>
  )
}

function weatherLabel(w: Weather, lang: Language): string {
  const map: Record<Language, Record<Weather, string>> = {
    zh: { clear: '晴', rain: '雨', snow: '雪', fog: '雾' },
    en: { clear: 'Clear', rain: 'Rain', snow: 'Snow', fog: 'Fog' },
  }
  return map[lang][w]
}
