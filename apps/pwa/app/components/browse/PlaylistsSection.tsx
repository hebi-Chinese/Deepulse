'use client'

// PlaylistsSection · 我的网易云歌单
// 未登录: 提示登录
// 已登录: 列表展示;点歌单 -> accordion 展开曲目;每首可播放/入列;"全部入列" 一键加全部

import { useEffect, useState } from 'react'

import { api, type ApiPlaylistMeta, type ApiSong } from '../../lib/api'

import type { LanguageHook } from '../settings/useLanguage'

type Props = {
  readonly language: LanguageHook
  readonly onPlay: (s: ApiSong) => void
  readonly onEnqueue: (s: ApiSong) => void
}

export function PlaylistsSection({ language, onPlay, onEnqueue }: Props) {
  const { t } = language
  const { playlists, loading, requiresLogin, error } = useMyPlaylists()
  return (
    <Card>
      <div className="text-[11px] tracking-widest text-white/45 uppercase mb-3">
        {t('myPlaylists')}
      </div>
      <Body
        playlists={playlists}
        loading={loading}
        requiresLogin={requiresLogin}
        error={error}
        language={language}
        onPlay={onPlay}
        onEnqueue={onEnqueue}
      />
    </Card>
  )
}

function Body(p: {
  readonly playlists: readonly ApiPlaylistMeta[]
  readonly loading: boolean
  readonly requiresLogin: boolean
  readonly error: string | undefined
  readonly language: LanguageHook
  readonly onPlay: (s: ApiSong) => void
  readonly onEnqueue: (s: ApiSong) => void
}) {
  const { t } = p.language
  if (p.loading) return <div className="text-white/40 text-sm animate-pulse">…</div>
  if (p.requiresLogin) return <div className="text-white/40 text-sm">{t('playlistsLoginPrompt')}</div>
  if (p.error !== undefined) return <div className="text-red-300/70 text-xs">{p.error}</div>
  if (p.playlists.length === 0) return <div className="text-white/40 text-sm">{t('playlistsEmpty')}</div>
  return (
    <ul className="space-y-1">
      {p.playlists.map((pl) => (
        <PlaylistRow key={pl.id} playlist={pl} language={p.language} onPlay={p.onPlay} onEnqueue={p.onEnqueue} />
      ))}
    </ul>
  )
}

function PlaylistRow({
  playlist,
  language,
  onPlay,
  onEnqueue,
}: {
  readonly playlist: ApiPlaylistMeta
  readonly language: LanguageHook
  readonly onPlay: (s: ApiSong) => void
  readonly onEnqueue: (s: ApiSong) => void
}) {
  const { t } = language
  const [open, setOpen] = useState(false)
  return (
    <li>
      <button
        type="button"
        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/8 group transition-colors text-left"
        onClick={() => {
          setOpen((v) => !v)
        }}
      >
        {playlist.coverUrl !== undefined ? (
          <img src={playlist.coverUrl} alt="" className="w-10 h-10 rounded-md object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-md bg-white/8" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white/90 truncate">{playlist.name}</div>
          <div className="text-xs text-white/45 truncate">
            {String(playlist.songCount)} {t('playlistSongCount')} · {playlist.isCreated ? '自建' : '收藏'}
          </div>
        </div>
        <span className="text-white/45 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open ? <TracksList playlistId={playlist.id} language={language} onPlay={onPlay} onEnqueue={onEnqueue} /> : null}
    </li>
  )
}

function TracksList({
  playlistId,
  language,
  onPlay,
  onEnqueue,
}: {
  readonly playlistId: string
  readonly language: LanguageHook
  readonly onPlay: (s: ApiSong) => void
  readonly onEnqueue: (s: ApiSong) => void
}) {
  const { t } = language
  const { tracks, loading, error } = usePlaylistTracks(playlistId)
  if (loading) return <div className="pl-12 py-2 text-white/40 text-xs animate-pulse">…</div>
  if (error !== undefined) return <div className="pl-12 py-2 text-red-300/70 text-xs">{error}</div>
  if (tracks.length === 0) return null
  return (
    <div className="pl-12 pr-2 pb-2 space-y-0.5 max-h-72 overflow-y-auto">
      <div className="flex justify-end pr-1 py-1">
        <button
          type="button"
          onClick={() => {
            for (const s of tracks) onEnqueue(s)
          }}
          className="text-[11px] text-white/55 hover:text-white tracking-widest"
        >
          {t('playlistPlayAll')} ({String(tracks.length)})
        </button>
      </div>
      {tracks.map((song) => (
        <TrackRow key={song.id} song={song} onPlay={onPlay} onEnqueue={onEnqueue} t={t} />
      ))}
    </div>
  )
}

function TrackRow({
  song,
  onPlay,
  onEnqueue,
  t,
}: {
  readonly song: ApiSong
  readonly onPlay: (s: ApiSong) => void
  readonly onEnqueue: (s: ApiSong) => void
  readonly t: LanguageHook['t']
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/6 group">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white/85 truncate">{song.title}</div>
        <div className="text-[11px] text-white/45 truncate">
          {song.artists.map((a) => a.name).join(' · ')}
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
        <button
          type="button"
          onClick={() => {
            onPlay(song)
          }}
          className="text-[10px] px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white"
        >
          {t('play')}
        </button>
        <button
          type="button"
          onClick={() => {
            onEnqueue(song)
          }}
          className="text-[10px] px-2 py-0.5 rounded bg-white/8 hover:bg-white/15 text-white/80"
        >
          {t('enqueue')}
        </button>
      </div>
    </div>
  )
}

function Card({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/6 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-5">
      {children}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// hooks

function useMyPlaylists(): {
  readonly playlists: readonly ApiPlaylistMeta[]
  readonly loading: boolean
  readonly requiresLogin: boolean
  readonly error: string | undefined
} {
  const [playlists, setPlaylists] = useState<readonly ApiPlaylistMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [requiresLogin, setRequiresLogin] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    api
      .myPlaylists()
      .then((r) => {
        if (!cancelled) setPlaylists(r.playlists)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('401')) setRequiresLogin(true)
        else setError(msg)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return { playlists, loading, requiresLogin, error }
}

function usePlaylistTracks(playlistId: string): {
  readonly tracks: readonly ApiSong[]
  readonly loading: boolean
  readonly error: string | undefined
} {
  const [tracks, setTracks] = useState<readonly ApiSong[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .playlistTracks(playlistId, 200)
      .then((r) => {
        if (!cancelled) setTracks(r.songs)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [playlistId])
  return { tracks, loading, error }
}
