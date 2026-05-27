'use client'

// Player · 顶层组装 — 房间永远在,Sill 按 ViewMode 切
// 关注点:
//  · audio 元素全局唯一 (Browse/Listen 共用,切 sill 不卸载)
//  · data-mode 挂在 <html> 上,驱动 CSS 的关窗动效 / 房间暗化
//  · 追踪 previousSong + userInitiated 给 DJ 用
//  · 顶栏: 设置 / cmdK 搜索
//  · 搜索方案 C (cmdK 浮窗) + D (DJ Chat 对话点歌)

import { useCallback, useEffect, useRef, useState } from 'react'

import { AtmosphereStage } from '../atmosphere/AtmosphereStage'
import { BrowseSill } from '../browse/BrowseSill'
import { CommandPalette } from '../command/CommandPalette'
import { useCommandPalette } from '../command/useCommandPalette'
import { ListenSill } from '../listen/ListenSill'
import { RoomScene } from '../room/RoomScene'
import { SettingsPanel } from '../settings/SettingsPanel'
import { useLanguage } from '../settings/useLanguage'

import { useAudioUnlock } from './useAudioUnlock'
import { usePlayerLogic } from './usePlayerLogic'
import { useViewMode } from './useViewMode'

import type { PlayerLogic } from './usePlayerLogic'
import type { ApiSong } from '../../lib/api'
import type { Weather } from '../atmosphere/types'
import type { LanguageHook } from '../settings/useLanguage'

export function Player() {
  const logic = usePlayerLogic()
  const view = useViewMode()
  const language = useLanguage()
  const cmdk = useCommandPalette()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [weather, setWeather] = useState<Weather>('rain')
  const trackMeta = useTrackMeta(logic.currentSong)
  useDataModeSync(view.mode)
  useAudioUnlock(logic.audioRef)

  const playAndListen = useCallback(
    (song: ApiSong) => {
      trackMeta.markUserInitiated()
      logic.actions.playSong(song)
      view.enterListen()
    },
    [logic.actions, view, trackMeta],
  )
  const playKeepView = useCallback(
    (song: ApiSong) => {
      trackMeta.markUserInitiated()
      logic.actions.playSong(song)
    },
    [logic.actions, trackMeta],
  )

  return (
    <AtmosphereStage weather={weather}>
      <SharedAudio logic={logic} />
      <RoomScene>
        <PlayerShell
          logic={logic}
          view={view}
          language={language}
          cmdk={cmdk}
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
          weather={weather}
          setWeather={setWeather}
          trackMeta={trackMeta}
          playAndListen={playAndListen}
          playKeepView={playKeepView}
        />
      </RoomScene>
    </AtmosphereStage>
  )
}

type ShellProps = {
  readonly logic: PlayerLogic
  readonly view: ReturnType<typeof useViewMode>
  readonly language: LanguageHook
  readonly cmdk: ReturnType<typeof useCommandPalette>
  readonly settingsOpen: boolean
  readonly setSettingsOpen: (v: boolean) => void
  readonly weather: Weather
  readonly setWeather: (w: Weather) => void
  readonly trackMeta: TrackMeta
  readonly playAndListen: (s: ApiSong) => void
  readonly playKeepView: (s: ApiSong) => void
}

function PlayerShell(p: ShellProps) {
  return (
    <>
      <TopToolbar
        language={p.language}
        onOpenSettings={() => {
          p.setSettingsOpen(true)
        }}
        onOpenCmdk={p.cmdk.toggle}
      />
      <SillSwitcher
        logic={p.logic}
        view={p.view}
        language={p.language}
        trackMeta={p.trackMeta}
        playAndListen={p.playAndListen}
        playKeepView={p.playKeepView}
      />
      <CommandPalette
        open={p.cmdk.open}
        onClose={() => {
          p.cmdk.setOpen(false)
        }}
        language={p.language}
        onPlay={p.view.mode === 'listen' ? p.playKeepView : p.playAndListen}
        onEnqueue={p.logic.actions.queueSong}
      />
      <SettingsPanel
        open={p.settingsOpen}
        onClose={() => {
          p.setSettingsOpen(false)
        }}
        language={p.language}
        weather={p.weather}
        onWeatherChange={p.setWeather}
      />
    </>
  )
}

type SwitcherProps = Pick<
  ShellProps,
  'logic' | 'view' | 'language' | 'trackMeta' | 'playAndListen' | 'playKeepView'
>

function SillSwitcher(p: SwitcherProps) {
  if (p.view.mode === 'listen') {
    return (
      <ListenSill
        audioRef={p.logic.audioRef}
        song={p.logic.currentSong}
        previousSong={p.trackMeta.previousSong}
        playing={p.logic.state.playing}
        lrcLines={p.logic.state.lrcLines}
        lrcLoading={p.logic.state.lrcLoading}
        activeLrcIndex={p.logic.activeLrcIndex}
        userInitiatedTrack={p.trackMeta.userInitiated}
        language={p.language}
        onTogglePlay={p.logic.actions.togglePlay}
        onPrev={() => {
          p.trackMeta.markUserInitiated()
          p.logic.actions.handlePrev()
        }}
        onNext={() => {
          p.trackMeta.markUserInitiated()
          p.logic.actions.handleNext()
        }}
        onExit={p.view.exitListen}
        onPlay={p.playKeepView}
      />
    )
  }
  return <BrowseSill logic={p.logic} language={p.language} onPlayAndListen={p.playAndListen} />
}

// ────────────────────────────────────────────────────────────────────────
// data-mode 同步 — 把 view.mode 写到 <html data-mode="..."> 驱动 CSS
// 也确保 [data-theme='minimal'] 和 [data-mode='dark'|...] 都存在

function useDataModeSync(mode: 'browse' | 'listen'): void {
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', 'minimal')
    // CSS 用 [data-mode='listen'] 触发关窗 / 暗化;Browse 时清空让默认透明 + 暗值=0
    if (mode === 'listen') {
      root.setAttribute('data-mode', 'listen')
    } else {
      root.setAttribute('data-mode', 'dark')
    }
  }, [mode])
}

// ────────────────────────────────────────────────────────────────────────
// 追踪上一首 + 切歌发起方 (DJ 文案要用)
// userInitiated 在用户操作前置 true,任何一次 currentSong 变化后会落到 prev,
// 然后被自动重置回 false (默认自动续播判定)

type TrackMeta = {
  readonly previousSong: ApiSong | undefined
  readonly userInitiated: boolean
  readonly markUserInitiated: () => void
}

// 用 ref 记住上一首 ApiSong 整对象,切歌时把 ref 旧值落到 state
function useTrackMeta(currentSong: ApiSong | undefined): TrackMeta {
  const [previousSong, setPreviousSong] = useState<ApiSong | undefined>(undefined)
  const [userInitiated, setUserInitiated] = useState(false)
  const pendingUserFlag = useRef(false)
  const lastSongRef = useRef<ApiSong | undefined>(undefined)

  useEffect(() => {
    if (currentSong?.id === lastSongRef.current?.id) return
    if (lastSongRef.current !== undefined) {
      setPreviousSong(lastSongRef.current)
    }
    lastSongRef.current = currentSong
    setUserInitiated(pendingUserFlag.current)
    pendingUserFlag.current = false
  }, [currentSong])

  const markUserInitiated = useCallback(() => {
    pendingUserFlag.current = true
  }, [])

  return { previousSong, userInitiated, markUserInitiated }
}

// ────────────────────────────────────────────────────────────────────────

function SharedAudio({ logic }: { readonly logic: PlayerLogic }) {
  // crossOrigin="anonymous" 必须有: useAudioAnalyser 会调 createMediaElementSource,
  // 跨域 audio 没 crossOrigin → Chrome 把 graph 标记 tainted → 整条输出静音
  // (audio.paused=false 还在播,但听不到声音)。NCM CDN 已返回 Access-Control-Allow-Origin: *
  return (
    <audio
      ref={logic.audioRef}
      crossOrigin="anonymous"
      onTimeUpdate={logic.actions.onTimeUpdate}
      onLoadedMetadata={logic.actions.onTimeUpdate}
      onPlay={logic.actions.onPlay}
      onPause={logic.actions.onPause}
      onEnded={logic.actions.handleEnded}
      preload="metadata"
    />
  )
}

function TopToolbar({
  language,
  onOpenSettings,
  onOpenCmdk,
}: {
  readonly language: LanguageHook
  readonly onOpenSettings: () => void
  readonly onOpenCmdk: () => void
}) {
  const { t } = language
  return (
    <div className="top-toolbar">
      <button
        type="button"
        className="tool-btn"
        onClick={onOpenCmdk}
        aria-label={t('search')}
        title={`${t('search')}  ⌘K`}
      >
        ⌕
      </button>
      <button
        type="button"
        className="tool-btn"
        onClick={onOpenSettings}
        aria-label={t('settings')}
        title={t('settings')}
      >
        ⚙
      </button>
    </div>
  )
}
