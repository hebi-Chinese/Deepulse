'use client'

import { useState } from 'react'

import { AtmosphereStage } from '../atmosphere/AtmosphereStage'
import { WeatherSwitcher } from '../atmosphere/WeatherSwitcher'

import { ControlsBar } from './ControlsBar'
import { ListenMode } from './ListenMode'
import { NowPlayingCard } from './NowPlayingCard'
import { QueuePanel } from './QueuePanel'
import { SearchPanel } from './SearchPanel'
import { usePlayerLogic } from './usePlayerLogic'
import { useSearch } from './useSearch'
import { useViewMode } from './useViewMode'

import type { ApiSong } from '../../lib/api'
import type { Weather } from '../atmosphere/types'

export function Player() {
  const logic = usePlayerLogic()
  const search = useSearch()
  const view = useViewMode()
  const [weather, setWeather] = useState<Weather>('rain')

  const playSongAndListen = (song: ApiSong): void => {
    logic.actions.playSong(song)
    view.enterListen()
  }

  return (
    <AtmosphereStage weather={weather}>
      <SharedAudio logic={logic} />
      <PlayerLayers
        logic={logic}
        search={search}
        view={view}
        weather={weather}
        onWeatherChange={setWeather}
        onPlayAndListen={playSongAndListen}
      />
    </AtmosphereStage>
  )
}

function SharedAudio({ logic }: { readonly logic: ReturnType<typeof usePlayerLogic> }) {
  // audio 元素全局唯一,Browse/Listen 都共用,避免切换 mode 时 audio 被卸载导致中断
  return (
    <audio
      ref={logic.audioRef}
      onTimeUpdate={logic.actions.onTimeUpdate}
      onLoadedMetadata={logic.actions.onTimeUpdate}
      onPlay={logic.actions.onPlay}
      onPause={logic.actions.onPause}
      onEnded={logic.actions.handleEnded}
      preload="metadata"
    />
  )
}

type PlayerLayersProps = {
  readonly logic: ReturnType<typeof usePlayerLogic>
  readonly search: ReturnType<typeof useSearch>
  readonly view: ReturnType<typeof useViewMode>
  readonly weather: Weather
  readonly onWeatherChange: (w: Weather) => void
  readonly onPlayAndListen: (song: ApiSong) => void
}

function PlayerLayers(props: PlayerLayersProps) {
  const { logic, search, view, weather, onWeatherChange, onPlayAndListen } = props
  const onSearchSubmit = (): void => {
    void search.submit(logic.actions.setError)
  }
  if (view.mode === 'listen') {
    return (
      <ListenMode
        audioRef={logic.audioRef}
        song={logic.currentSong}
        playing={logic.state.playing}
        lrcLines={logic.state.lrcLines}
        lrcLoading={logic.state.lrcLoading}
        activeLrcIndex={logic.activeLrcIndex}
        onTogglePlay={logic.actions.togglePlay}
        onPrev={logic.actions.handlePrev}
        onNext={logic.actions.handleNext}
        onExit={view.exitListen}
      />
    )
  }
  return (
    <BrowseLayer
      logic={logic}
      search={search}
      weather={weather}
      onWeatherChange={onWeatherChange}
      onSearchSubmit={onSearchSubmit}
      onPlayAndListen={onPlayAndListen}
    />
  )
}

type BrowseLayerProps = {
  readonly logic: ReturnType<typeof usePlayerLogic>
  readonly search: ReturnType<typeof useSearch>
  readonly weather: Weather
  readonly onWeatherChange: (w: Weather) => void
  readonly onSearchSubmit: () => void
  readonly onPlayAndListen: (song: ApiSong) => void
}

function BrowseLayer(props: BrowseLayerProps) {
  const { logic, search, weather, onWeatherChange, onSearchSubmit, onPlayAndListen } = props
  return (
    <>
      <WeatherSwitcher weather={weather} onChange={onWeatherChange} />
      <div className="min-h-screen text-white">
        <div className="max-w-6xl mx-auto px-6 py-10 pb-32">
          <PageHeader />
          {logic.state.error !== undefined ? <ErrorBanner message={logic.state.error} /> : null}
          <MainGrid
            logic={logic}
            search={search}
            onSearchSubmit={onSearchSubmit}
            onPlayAndListen={onPlayAndListen}
          />
        </div>
        <BottomControls logic={logic} />
      </div>
    </>
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

type MainGridProps = {
  readonly logic: ReturnType<typeof usePlayerLogic>
  readonly search: ReturnType<typeof useSearch>
  readonly onSearchSubmit: () => void
  readonly onPlayAndListen: (song: ApiSong) => void
}

function MainGrid(props: MainGridProps) {
  const { logic, search, onSearchSubmit, onPlayAndListen } = props
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
            onPlay={onPlayAndListen}
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
