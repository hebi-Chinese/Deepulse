'use client'

// BrowseSill · Browse 模式下的下半视图陈设
// 内容: NowPlaying 资料卡 / 今日推荐 / 播放队列
// 上半视图就是房间的窗户 + 雨 (RoomScene 负责),这里只管下半
// 视觉: 居中布局,玻璃质感卡,字体克制,留白多

import { useEffect, useState } from 'react'

import { api, type ApiSong } from '../../lib/api'
import { ControlsBar } from '../player/ControlsBar'
import { QueuePanel } from '../player/QueuePanel'

import { PlaylistsSection } from './PlaylistsSection'

import type { PlayerLogic } from '../player/usePlayerLogic'
import type { LanguageHook } from '../settings/useLanguage'

type Props = {
  readonly logic: PlayerLogic
  readonly language: LanguageHook
  readonly onPlayAndListen: (song: ApiSong) => void
}

export function BrowseSill({ logic, language, onPlayAndListen }: Props) {
  return (
    <>
      <section
        className="fixed left-0 right-0 bottom-24 z-30 pointer-events-none"
        style={{ top: 'calc(var(--win-top) + var(--win-h) + 32px)' }}
      >
        <div className="max-w-5xl mx-auto h-full px-6 pointer-events-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 h-full">
            <div className="space-y-5 overflow-y-auto pr-1">
              <NowPlayingTile logic={logic} language={language} onPlayAndListen={onPlayAndListen} />
              <PlaylistsSection
                language={language}
                onPlay={onPlayAndListen}
                onEnqueue={logic.actions.queueSong}
              />
              <DailyRecommendations onPlay={onPlayAndListen} onEnqueue={logic.actions.queueSong} language={language} />
            </div>
            <div className="overflow-y-auto">
              <Card>
                <QueuePanel
                  queue={logic.state.queue}
                  currentIndex={logic.state.currentIndex}
                  onRemove={logic.actions.removeFromQueue}
                />
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Browse 底栏控制 (Listen 时由 ListenSill 自己提供半透浮控) */}
      <BottomBar logic={logic} />
    </>
  )
}

function Card({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/6 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-5">
      {children}
    </div>
  )
}

function NowPlayingTile({
  logic,
  language,
}: {
  readonly logic: PlayerLogic
  readonly language: LanguageHook
  readonly onPlayAndListen: (song: ApiSong) => void
}) {
  const song = logic.currentSong
  const { t } = language
  if (song === undefined) {
    return (
      <Card>
        <div className="text-white/55 text-sm font-light tracking-wider">{t('noSongSelected')}</div>
        <div className="mt-2 text-white/35 text-xs">{t('recommendHint')}</div>
      </Card>
    )
  }
  return (
    <Card>
      <div className="flex items-center gap-4">
        {song.coverUrl !== undefined ? (
          <img src={song.coverUrl} alt="" className="w-20 h-20 rounded-xl object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-white/8" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] tracking-widest text-white/45 uppercase">{t('nowPlaying')}</div>
          <div className="mt-1 text-white text-lg font-light truncate">{song.title}</div>
          <div className="text-white/55 text-sm truncate">
            {song.artists.map((a) => a.name).join(' · ')}
          </div>
        </div>
      </div>
    </Card>
  )
}

function DailyRecommendations({
  onPlay,
  onEnqueue,
  language,
}: {
  readonly onPlay: (s: ApiSong) => void
  readonly onEnqueue: (s: ApiSong) => void
  readonly language: LanguageHook
}) {
  const { t } = language
  const { songs, loading, errored } = useDailyFetch()
  return (
    <Card>
      <div className="text-[11px] tracking-widest text-white/45 uppercase mb-3">
        {t('recommendDaily')}
      </div>
      {loading ? (
        <div className="text-white/40 text-sm animate-pulse">…</div>
      ) : errored || songs.length === 0 ? (
        <div className="text-white/40 text-sm">{t('recommendEmpty')}</div>
      ) : (
        <ul className="space-y-0.5">
          {songs.slice(0, 8).map((song) => (
            <RecRow key={song.id} song={song} onPlay={onPlay} onEnqueue={onEnqueue} t={t} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function useDailyFetch(): {
  readonly songs: readonly ApiSong[]
  readonly loading: boolean
  readonly errored: boolean
} {
  const [songs, setSongs] = useState<readonly ApiSong[]>([])
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)
  useEffect(() => {
    let cancelled = false
    api
      .dailyRecommendations()
      .then((res) => {
        if (!cancelled) setSongs(res.songs)
      })
      .catch(() => {
        if (!cancelled) setErrored(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return { songs, loading, errored }
}

function RecRow({
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
    <li className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/8 group transition-colors">
      {song.coverUrl !== undefined ? (
        <img src={song.coverUrl} alt="" className="w-10 h-10 rounded-md object-cover" />
      ) : (
        <div className="w-10 h-10 rounded-md bg-white/8" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white/90 truncate">{song.title}</div>
        <div className="text-xs text-white/50 truncate">
          {song.artists.map((a) => a.name).join(' · ')}
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
        <button
          type="button"
          onClick={() => {
            onPlay(song)
          }}
          className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white"
        >
          {t('play')}
        </button>
        <button
          type="button"
          onClick={() => {
            onEnqueue(song)
          }}
          className="text-xs px-2.5 py-1 rounded-md bg-white/8 hover:bg-white/15 text-white/80"
        >
          {t('enqueue')}
        </button>
      </div>
    </li>
  )
}

function BottomBar({ logic }: { readonly logic: PlayerLogic }) {
  return (
    <ControlsBar
      playing={logic.state.playing}
      hasSong={logic.currentSong !== undefined}
      queueEmpty={logic.state.queue.length === 0}
      currentTimeSec={logic.state.currentTimeSec}
      durationSec={logic.state.durationSec}
      volume={logic.state.volume}
      muted={logic.state.muted}
      mode={logic.state.mode}
      onPrev={logic.actions.handlePrev}
      onNext={logic.actions.handleNext}
      onTogglePlay={logic.actions.togglePlay}
      onSeek={logic.actions.onSeek}
      onVolumeChange={logic.actions.setVolume}
      onToggleMute={logic.actions.toggleMute}
      onCycleMode={logic.actions.cycleMode}
    />
  )
}
