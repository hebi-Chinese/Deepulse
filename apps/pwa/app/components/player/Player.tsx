'use client'

// Player · 顶层组装 — 房间永远在,Sill 按 ViewMode 切
// 关注点:
//  · audio 元素全局唯一 (Browse/Listen 共用,切 sill 不卸载)
//  · data-mode 挂在 <html> 上,驱动 CSS 的关窗动效 / 房间暗化
//  · 追踪 previousSong + userInitiated 给 DJ 用
//  · 顶栏: 设置 / cmdK 搜索
//  · 搜索方案 C (cmdK 浮窗) + D (DJ Chat 对话点歌)

import { useCallback, useEffect, useRef, useState } from 'react'

import { AtmosphereCanvas } from '../atmosphere/AtmosphereCanvas'
import { BrowseAdjustHud } from '../browse/BrowseAdjustHud'
import { BrowseSill } from '../browse/BrowseSill'
import { BrowseWeatherOutline, useBrowseAdjuster } from '../browse/useBrowseAdjuster'
import { CommandPalette } from '../command/CommandPalette'
import { useCommandPalette } from '../command/useCommandPalette'
import { WindowToggle } from '../room/WindowToggle'
import {
  ListenWeatherAdjustHud,
  ListenWeatherOutline,
  SceneStage,
  useListenWeatherAdjuster,
} from '../scene/SceneStage'
import { SettingsPanel } from '../settings/SettingsPanel'
import { useLanguage } from '../settings/useLanguage'

import { ImportButton } from './ImportButton'
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
  const adjustingLw = useListenWeatherAdjuster()
  const cb = usePlayCallbacks(logic, view, trackMeta)

  const shellProps: ShellProps = {
    logic,
    view,
    language,
    cmdk,
    settingsOpen,
    setSettingsOpen,
    weather,
    setWeather,
    trackMeta,
    playAndListen: cb.playAndListen,
    playKeepView: cb.playKeepView,
    importLocal: cb.importLocal,
  }
  // SharedAudio 必须在最外层渲染, 跨 mode 切换时不卸载 (否则 audio.src 丢, 歌停 + UI 卡播放中)
  // Browse / Listen 是两套 React 树: 都自带房间场景图 + 天气, 切 mode 走整树 swap
  return (
    <>
      <SharedAudio logic={logic} />
      {view.mode === 'listen' ? (
        <ListenStageView p={shellProps} />
      ) : (
        <BrowseStageView p={shellProps} />
      )}
      {adjustingLw ? (
        <>
          <ListenWeatherAdjustHud />
          {view.mode === 'listen' ? <ListenWeatherOutline /> : null}
        </>
      ) : null}
    </>
  )
}

// listen 模式 — SceneStage + Overlays (设置/cmdk),不挂 RoomScene/TopToolbar/WindowToggle
function ListenStageView({ p }: { readonly p: ShellProps }) {
  return (
    <>
      <SceneStage
        audioRef={p.logic.audioRef}
        song={p.logic.currentSong}
        previousSong={p.trackMeta.previousSong}
        playing={p.logic.state.playing}
        userInitiatedTrack={p.trackMeta.userInitiated}
        language={p.language}
        queueLen={p.logic.state.queue.length}
        weather={p.weather}
        {...lrcTextProp(p)}
        volume={p.logic.state.volume}
        muted={p.logic.state.muted}
        onSetVolume={p.logic.actions.setVolume}
        onToggleMute={p.logic.actions.toggleMute}
        onTogglePlay={p.logic.actions.togglePlay}
        onPrev={() => {
          p.trackMeta.markUserInitiated()
          p.logic.actions.handlePrev()
        }}
        onNext={() => {
          p.trackMeta.markUserInitiated()
          p.logic.actions.handleNext()
        }}
        onPlay={p.playKeepView}
        onExitListen={p.view.exitListen}
        onOpenSettings={() => {
          p.setSettingsOpen(true)
        }}
        onOpenCmdk={p.cmdk.toggle}
      />
      <Overlays p={p} />
    </>
  )
}

// 当前歌词行 → optional prop (exactOptionalPropertyTypes 不接受 undefined 显式赋值,
// 必须 spread 才能省 key)
function lrcTextProp(p: ShellProps): { currentLrcText?: string } {
  const text = p.logic.state.lrcLines[p.logic.activeLrcIndex]?.text
  return text !== undefined ? { currentLrcText: text } : {}
}

// browse 模式 — 正面电台场景 (search-bg.png) + 天气粒子 + PlayerShell (顶栏/搜索/设置)
function BrowseStageView({ p }: { readonly p: ShellProps }) {
  const showWeather = p.weather === 'rain' || p.weather === 'snow'
  const adjusting = useBrowseAdjuster()
  return (
    <div className="browse-scene-bg">
      {showWeather ? (
        <AtmosphereCanvas weather={p.weather} className="browse-weather-canvas" />
      ) : null}
      <PlayerShell {...p} />
      {adjusting ? (
        <>
          <BrowseAdjustHud />
          <BrowseWeatherOutline />
        </>
      ) : null}
    </div>
  )
}

function usePlayCallbacks(
  logic: PlayerLogic,
  view: ReturnType<typeof useViewMode>,
  trackMeta: TrackMeta,
): {
  readonly playAndListen: (s: ApiSong) => void
  readonly playKeepView: (s: ApiSong) => void
  readonly importLocal: (songs: readonly ApiSong[]) => void
} {
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
  // 导入本地: 第一首 playAndListen,其余 enqueue
  const importLocal = useCallback(
    (songs: readonly ApiSong[]) => {
      if (songs.length === 0) return
      const [first, ...rest] = songs
      if (first !== undefined) playAndListen(first)
      for (const s of rest) logic.actions.queueSong(s)
    },
    [playAndListen, logic.actions],
  )
  return { playAndListen, playKeepView, importLocal }
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
  readonly importLocal: (songs: readonly ApiSong[]) => void
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
        onImport={p.importLocal}
      />
      <SillSwitcher
        logic={p.logic}
        view={p.view}
        language={p.language}
        trackMeta={p.trackMeta}
        playAndListen={p.playAndListen}
        playKeepView={p.playKeepView}
      />
      <BottomFloats p={p} />
      <Overlays p={p} />
    </>
  )
}

// 左下关窗按钮 (browse 模式下进 listen 的入口)
// 注意: listen 模式现在走 SceneStage,自带左下 ⊘ 退出按钮和右下 DJ 按钮,
//      所以这里不再需要 VolumeFloat / 不再需要 listen 分支
function BottomFloats({ p }: { readonly p: ShellProps }) {
  return (
    <WindowToggle
      mode={p.view.mode}
      language={p.language}
      enterDisabled={p.logic.currentSong === undefined}
      onEnter={() => {
        if (p.logic.currentSong !== undefined) {
          p.trackMeta.markUserInitiated()
          p.view.enterListen()
        }
      }}
      onExit={p.view.exitListen}
    />
  )
}

// 命令面板 + 设置抽屉
function Overlays({ p }: { readonly p: ShellProps }) {
  return (
    <>
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

// PlayerShell 现在只在 browse 模式渲染 (listen 走 SceneStage),
// 所以这里直接返回 BrowseSill,不再分支 ListenSill
// 注: Browse 里点歌走 playKeepView (不强切 Listen) — 用户自己点关窗才进 Listen
function SillSwitcher(p: SwitcherProps) {
  return <BrowseSill logic={p.logic} language={p.language} onPlay={p.playKeepView} />
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
  onImport,
}: {
  readonly language: LanguageHook
  readonly onOpenSettings: () => void
  readonly onOpenCmdk: () => void
  readonly onImport: (songs: readonly ApiSong[]) => void
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
      <ImportButton title={t('importLocal')} onImport={onImport} />
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
