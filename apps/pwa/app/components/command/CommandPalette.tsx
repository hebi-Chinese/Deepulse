'use client'

// CommandPalette · 浮窗式搜索 (cmd/ctrl + K)
// 输入框 → 实时 (debounce 250ms) 调 search → 列表
// Enter 播放并跳 Listen / Tab 入列 / Esc 关 / 上下方向键选

import { useEffect, useRef, useState } from 'react'

import { api, type ApiSong } from '../../lib/api'

import type { LanguageHook } from '../settings/useLanguage'

type Props = {
  readonly open: boolean
  readonly onClose: () => void
  readonly language: LanguageHook
  readonly onPlay: (song: ApiSong) => void
  readonly onEnqueue: (song: ApiSong) => void
}

const DEBOUNCE_MS = 250
const SEARCH_LIMIT = 18

export function CommandPalette({ open, onClose, language, onPlay, onEnqueue }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly ApiSong[]>([])
  const [active, setActive] = useState(0)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useFocusOnOpen(open, inputRef)
  useDebouncedSearch(query, setResults, setSearching, setError)
  useKeyNav({
    open,
    onClose,
    results,
    active,
    setActive,
    onPlay,
    onEnqueue,
    onAfterAction: onClose,
  })

  if (!open) return null
  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <CmdkBody
        language={language}
        inputRef={inputRef}
        query={query}
        setQuery={setQuery}
        setActive={setActive}
        active={active}
        results={results}
        searching={searching}
        error={error}
        onPlay={onPlay}
        onClose={onClose}
      />
    </div>
  )
}

type BodyProps = {
  readonly language: LanguageHook
  readonly inputRef: React.RefObject<HTMLInputElement | null>
  readonly query: string
  readonly setQuery: (v: string) => void
  readonly setActive: (n: number) => void
  readonly active: number
  readonly results: readonly ApiSong[]
  readonly searching: boolean
  readonly error: string | null
  readonly onPlay: (s: ApiSong) => void
  readonly onClose: () => void
}

function CmdkBody(p: BodyProps) {
  const { t } = p.language
  return (
    <div
      className="cmdk-panel"
      onClick={(e) => {
        e.stopPropagation()
      }}
      role="dialog"
    >
      <input
        ref={p.inputRef}
        className="cmdk-input"
        placeholder={t('cmdkPlaceholder')}
        value={p.query}
        onChange={(e) => {
          p.setQuery(e.target.value)
          p.setActive(0)
        }}
        aria-label={t('search')}
        autoComplete="off"
      />
      <CmdkList {...p} />
      <div className="cmdk-hint">
        <span>
          <span className="cmdk-kbd">Enter</span> {t('cmdkHintPlay')}
        </span>
        <span>
          <span className="cmdk-kbd">Tab</span> {t('cmdkHintEnqueue')}
        </span>
        <span>
          <span className="cmdk-kbd">Esc</span> {t('cmdkHintExit')}
        </span>
      </div>
    </div>
  )
}

function CmdkList(p: BodyProps) {
  const { t } = p.language
  if (p.error !== null && p.results.length === 0) {
    return (
      <div className="cmdk-list">
        <EmptyHint>{`✗ ${p.error}`}</EmptyHint>
      </div>
    )
  }
  if (p.results.length === 0) {
    const msg = p.searching || p.query.trim().length > 0 ? t('cmdkPlaceholder') : t('searchEmpty')
    return (
      <div className="cmdk-list">
        <EmptyHint>{msg}</EmptyHint>
      </div>
    )
  }
  return (
    <div className="cmdk-list">
      {p.results.map((song, idx) => (
        <CmdRow
          key={song.id}
          song={song}
          active={idx === p.active}
          onHover={() => {
            p.setActive(idx)
          }}
          onClick={() => {
            p.onPlay(song)
            p.onClose()
          }}
        />
      ))}
    </div>
  )
}

function EmptyHint({ children }: { readonly children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-white/40 text-sm">{children}</div>
}

function CmdRow({
  song,
  active,
  onHover,
  onClick,
}: {
  readonly song: ApiSong
  readonly active: boolean
  readonly onHover: () => void
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      className="cmdk-row"
      data-active={active ? 'true' : 'false'}
      onMouseEnter={onHover}
      onClick={onClick}
    >
      {song.coverUrl !== undefined ? (
        <img src={song.coverUrl} alt="" className="w-10 h-10 rounded-md object-cover" />
      ) : (
        <div className="w-10 h-10 rounded-md bg-white/8" />
      )}
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium truncate text-white/95">{song.title}</div>
        <div className="text-xs text-white/55 truncate">
          {song.artists.map((a) => a.name).join(' · ')}
          {song.album !== undefined ? ` — ${song.album.name}` : ''}
        </div>
      </div>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────
// hooks

function useFocusOnOpen(open: boolean, ref: React.RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      ref.current?.focus()
    })
  }, [open, ref])
}

function useDebouncedSearch(
  query: string,
  setResults: (r: readonly ApiSong[]) => void,
  setSearching: (v: boolean) => void,
  setError: (msg: string | null) => void,
): void {
  useEffect(() => {
    const q = query.trim()
    if (q.length === 0) {
      setResults([])
      setSearching(false)
      setError(null)
      return
    }
    setSearching(true)
    setError(null)
    let cancelled = false
    const handle = window.setTimeout(() => {
      api
        .search(q, SEARCH_LIMIT)
        .then((res) => {
          if (!cancelled) setResults(res.songs)
        })
        .catch((err: unknown) => {
          // DANGEROUS-2 fix: search 失败必须区分 "0 结果" vs "网络挂了". 之前静默清空结果
          // 让用户以为搜不到 — 没有 actionable 信号去发现后端挂了
          console.error('[CommandPalette] search failed for', q, err)
          if (!cancelled) {
            setResults([])
            setError(err instanceof Error ? err.message : '搜索失败, 请重试')
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [query, setResults, setSearching, setError])
}

type KeyNavOpts = {
  readonly open: boolean
  readonly onClose: () => void
  readonly results: readonly ApiSong[]
  readonly active: number
  readonly setActive: (n: number) => void
  readonly onPlay: (s: ApiSong) => void
  readonly onEnqueue: (s: ApiSong) => void
  readonly onAfterAction: () => void
}

function useKeyNav(opts: KeyNavOpts): void {
  useEffect(() => {
    if (!opts.open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        opts.onClose()
        return
      }
      if (opts.results.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        opts.setActive((opts.active + 1) % opts.results.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        opts.setActive((opts.active - 1 + opts.results.length) % opts.results.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const song = opts.results[opts.active]
        if (song !== undefined) {
          opts.onPlay(song)
          opts.onAfterAction()
        }
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const song = opts.results[opts.active]
        if (song !== undefined) opts.onEnqueue(song)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [opts])
}
