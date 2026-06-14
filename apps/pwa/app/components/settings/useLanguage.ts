'use client'

// useLanguage · 全局语言 hook + localStorage 持久化 + 返回 t() 翻译函数

import { useCallback, useEffect, useState } from 'react'

import { DICTS, LANGUAGES, type LangKey, type Language } from '../../lib/i18n'

const STORAGE_KEY = 'deepulse.lang'

export type LanguageHook = {
  readonly lang: Language
  readonly setLang: (next: Language) => void
  readonly t: (key: LangKey) => string
}

function readStored(): Language {
  if (typeof window === 'undefined') return 'zh'
  const v = window.localStorage.getItem(STORAGE_KEY)
  return (LANGUAGES as readonly string[]).includes(v ?? '') ? (v as Language) : 'zh'
}

export function useLanguage(): LanguageHook {
  const [lang, setLangState] = useState<Language>('zh')

  // SSR-safe: 客户端首次挂载读 localStorage
  useEffect(() => {
    setLangState(readStored())
  }, [])

  const setLang = useCallback((next: Language) => {
    setLangState(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const t = useCallback((key: LangKey) => DICTS[lang][key], [lang])

  return { lang, setLang, t }
}
