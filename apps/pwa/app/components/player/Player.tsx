'use client'

import { useState } from 'react'

import { AtmosphereStage } from '../atmosphere/AtmosphereStage'
import { WeatherSwitcher } from '../atmosphere/WeatherSwitcher'


import { ControlsBar } from './ControlsBar'
import { NowPlayingCard } from './NowPlayingCard'
import { QueuePanel } from './QueuePanel'
import { SearchPanel } from './SearchPanel'
import { usePlayerLogic } from './usePlayerLogic'
import { useSearch } from './useSearch'

import type { Weather } from '../atmosphere/types'

export function Player() {
  const logic = usePlayerLogic()
  const search = useSearch()
  const [weather, setWeather] = useState<Weather>('rain')

  const onSearchSubmit = (): void => {
    void search.submit(logic.actions.setError)
  }

  return (
    <AtmosphereStage weather={weather}>
      <WeatherSwitcher weather={weather} onChange={setWeather} />
      <div className="min-h-screen text-white">
        <audio
          ref={logic.audioRef}
          onTimeUpdate={logic.actions.onTimeUpdate}
          onLoadedMetadata={logic.actions.onTimeUpdate}
          onPlay={logic.actions.onPlay}
          onPause={logic.actions.onPause}
          onEnded={logic.actions.handleEnded}
          preload="metadata"
        />

        <div className="max-w-6xl mx-auto px-6 py-10 pb-32">
          <PageHeader />
          {logic.state.error !== undefined ? <ErrorBanner message={logic.state.error} /> : null}
          <MainGrid logic={logic} search={search} onSearchSubmit={onSearchSubmit} />
        </div>
        <BottomControls logic={logic} />
      </div>
    </AtmosphereStage>
  )
}

function PageHeader() {
  return (
    <header className="mb-10">
      <h1 className="text-5xl font-light tracking-[-0.04em] text-white">Claudio</h1>
      <p className="text-white/55 text-sm mt-2 tracking-wide">个人 AI 电台</p>
    </header>
  )
}

function ErrorBanner({ message }: { readonly message: string }) {
  return (
    <div className="mb-4 p-3 rounded-xl bg-red-500/15 backdrop-blur-xl border border-red-500/25 text-red-100 text-sm">
      {message}
    </div>
  )
}

function MainGrid(props: {
  readonly logic: ReturnType<typeof usePlayerLogic>
  readonly search: ReturnType<typeof useSearch>
  readonly onSearchSubmit: () => void
}) {
  const { logic, search, onSearchSubmit } = props
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
      <main className="space-y-5">
        <GlassPanel>
          <SearchPanel
            query={search.query}
            onQueryChange={search.setQuery}
            onSubmit={onSearchSubmit}
            searching={search.searching}
            results={search.results}
            onPlay={logic.actions.playSong}
            onEnqueue={logic.actions.queueSong}
          />
        </GlassPanel>
        <GlassPanel>
          <NowPlayingCard
            song={logic.currentSong}
            lrcLines={logic.state.lrcLines}
            lrcLoading={logic.state.lrcLoading}
            activeLrcIndex={logic.activeLrcIndex}
          />
        </GlassPanel>
      </main>
      <GlassPanel>
        <QueuePanel
          queue={logic.state.queue}
          currentIndex={logic.state.currentIndex}
          onRemove={logic.actions.removeFromQueue}
        />
      </GlassPanel>
    </div>
  )
}

function BottomControls({ logic }: { readonly logic: ReturnType<typeof usePlayerLogic> }) {
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

function GlassPanel({ children }: { readonly children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/6 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6">
      {children}
    </section>
  )
}
