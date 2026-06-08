'use client'

// SceneStage · Listen 模式的整个沉浸场景
// 替代旧的 RoomScene + ListenSill,直接渲染整张深夜电台 DJ 房:
//   底图 → 窗户(风铃/雨/凝水) → 月光带 → 尘埃 → 真实麦 → DJ 字幕 → viz 律动 → UI chrome
// audio 元素仍由 Player 顶层托管, 这里只消费 state + callback

import { useState } from 'react'

import { AtmosphereCanvas } from '../atmosphere/AtmosphereCanvas'
import { DjChat } from '../listen/DjChat'
import { useDjCloud } from '../listen/useDjState'

import {
  ListenWeatherAdjustHud,
  ListenWeatherOutline,
  useListenWeatherAdjuster,
} from './ListenWeatherAdjuster'
import { SceneVizBars } from './SceneVizBars'
import { SceneWindow } from './SceneWindow'
import { useVinylAdjuster, VinylAdjustHud } from './VinylAdjuster'

import type { ApiSong } from '../../lib/api'
import type { Weather } from '../atmosphere/types'
import type { LanguageHook } from '../settings/useLanguage'

// Re-export 调试模式 hook + UI: Player.tsx 走 SceneStage 这条统一入口拿,
// 避免外部模块直接 import 调试子模块
export { useListenWeatherAdjuster, ListenWeatherAdjustHud, ListenWeatherOutline }

// 月光中漂浮的 15 个尘埃 (大小 + delay 错开)
const MOTES = [
  { left: '70%', bottom: '5%', delay: 0, big: true },
  { left: '80%', bottom: '8%', delay: -1.2, big: false },
  { left: '65%', bottom: '12%', delay: -2.4, big: true },
  { left: '90%', bottom: '6%', delay: -3.6, big: false },
  { left: '75%', bottom: '16%', delay: -4.8, big: false },
  { left: '60%', bottom: '22%', delay: -6.0, big: true },
  { left: '85%', bottom: '18%', delay: -7.2, big: false },
  { left: '72%', bottom: '28%', delay: -8.4, big: false },
  { left: '95%', bottom: '24%', delay: -0.6, big: true },
  { left: '68%', bottom: '35%', delay: -1.8, big: false },
  { left: '82%', bottom: '32%', delay: -3.0, big: false },
  { left: '88%', bottom: '40%', delay: -4.2, big: true },
  { left: '55%', bottom: '45%', delay: -5.4, big: false },
  { left: '78%', bottom: '50%', delay: -6.6, big: false },
  { left: '92%', bottom: '55%', delay: -7.8, big: true },
]

type Props = {
  readonly audioRef: React.RefObject<HTMLAudioElement | null>
  readonly song: ApiSong | undefined
  readonly previousSong: ApiSong | undefined
  readonly playing: boolean
  readonly userInitiatedTrack: boolean
  readonly language: LanguageHook
  readonly volume: number
  readonly muted: boolean
  readonly onSetVolume: (v: number) => void
  readonly onToggleMute: () => void
  readonly onTogglePlay: () => void
  readonly onPrev: () => void
  readonly onNext: () => void
  readonly onPlay: (s: ApiSong) => void
  readonly onExitListen: () => void
  readonly onOpenSettings: () => void
  readonly onOpenCmdk: () => void
  readonly queueLen?: number
  readonly weather: Weather
  // mic 旁字幕优先级: DJ 文本 > 当前歌词行 > 歌名 · 歌手 (兜底, 歌词没加载/还没到)
  readonly currentLrcText?: string
}

export function SceneStage(props: Props) {
  const djMsg = useDjCloud({
    currentSong: props.song,
    previousSong: props.previousSong,
    userInitiated: props.userInitiatedTrack,
    enabled: props.song !== undefined,
    lang: props.language.lang,
  })
  const [chatOpen, setChatOpen] = useState(false)
  return (
    <>
      <SceneBackdrop weather={props.weather} />
      <SceneVinyl song={props.song} playing={props.playing} />
      <img className="scene-mic" src="/scene/mic.png" alt="" aria-hidden="true" />
      <SceneDjSubtitle
        djText={djMsg?.text ?? null}
        lrcText={props.currentLrcText ?? null}
        songRef={songRefFromApi(props.song)}
        djLabel="DJ · 夜间电台"
      />
      <SceneVizBars audioRef={props.audioRef} playing={props.playing} />
      <SceneFx />
      <SceneChrome props={props} chatOpen={chatOpen} setChatOpen={setChatOpen} />
    </>
  )
}

// 顶栏 / transport / 退出 / 音量 / DJ 按钮 + chat — 都是 chrome, 拆出来让 SceneStage 主体短
function SceneChrome({
  props,
  chatOpen,
  setChatOpen,
}: {
  readonly props: Props
  readonly chatOpen: boolean
  readonly setChatOpen: React.Dispatch<React.SetStateAction<boolean>>
}) {
  return (
    <>
      <SceneTopBar
        onOpenSettings={props.onOpenSettings}
        onOpenCmdk={props.onOpenCmdk}
        t={props.language.t}
      />
      <SceneTransport
        song={props.song}
        playing={props.playing}
        onTogglePlay={props.onTogglePlay}
        onPrev={props.onPrev}
        onNext={props.onNext}
        t={props.language.t}
      />
      <ExitListenBtn onExit={props.onExitListen} title={props.language.t('browse')} />
      <SceneVolume
        volume={props.volume}
        muted={props.muted}
        onSetVolume={props.onSetVolume}
        onToggleMute={props.onToggleMute}
      />
      <SceneDjButton
        active={chatOpen}
        onToggle={() => {
          setChatOpen((v) => !v)
        }}
      />
      <SceneDjChat open={chatOpen} setOpen={setChatOpen} p={props} />
    </>
  )
}

// ─── 静态背景层 ──────────────────────────────────────────────────────────

function SceneBackdrop({ weather }: { readonly weather: Weather }) {
  // 分层渲染 (从底到顶, z-index 顺序):
  //   1. scene-bg (z=1)            完整 listen-bg.png — 底层 (窗外天空 + 屋内 全有)
  //   2. scene-window (z=2)         风铃 + 雾 overlay (装在窗户矩形里)
  //   3. scene-weather-canvas (z=3) Canvas 粒子层 (雨/雪) 限定到窗户矩形, 不裁形状
  //   4. scene-foreground (z=4)    再画一次 listen-bg.png, 反向 mask 抠窗户洞
  //                                → 屋内位置覆盖在 canvas 之上 (粒子被墙挡, 看不到溢出)
  //                                → 窗户位置透明 → 看到 z=3 的粒子
  //   5. scene-vinyl-wrap (z=5)    唱片 (近景, 在前景之上, 真贴在唱片机平台)
  //   6. scene-mic (z=7)            麦克风 (同上)
  const showCanvas = weather === 'rain' || weather === 'snow'
  return (
    <>
      <div className="scene-bg" />
      <SceneWindow />
      {showCanvas ? <AtmosphereCanvas weather={weather} className="scene-weather-canvas" /> : null}
      <div className="scene-foreground" aria-hidden="true" />
      <div className="scene-moon-beam" aria-hidden="true" />
      <div className="scene-dust" aria-hidden="true">
        {MOTES.map((m, i) => (
          <div
            key={`mote-${String(i)}`}
            className={m.big ? 'scene-mote big' : 'scene-mote'}
            style={{ left: m.left, bottom: m.bottom, animationDelay: `${String(m.delay)}s` }}
          />
        ))}
      </div>
    </>
  )
}

// vinyl = 2D 椭圆 decal 贴到真转盘表面 (新 listen-bg.png)
// 位置/尺寸全部走 CSS var --vinyl-* 驱动, 调试模式 ?adjust=vinyl 可键盘实时改
function SceneVinyl({
  song,
  playing,
}: {
  readonly song: ApiSong | undefined
  readonly playing: boolean
}) {
  const adjusting = useVinylAdjuster()
  if (song?.coverUrl === undefined || song.coverUrl === '') return null
  return (
    <>
      <div
        className="scene-vinyl-wrap"
        aria-hidden="true"
        data-playing={playing}
        // eslint-disable-next-line @typescript-eslint/naming-convention -- HTML data-* attr
        {...(adjusting ? { 'data-adjust': 'true' } : {})}
      >
        <div className="scene-vinyl" style={{ backgroundImage: `url(${song.coverUrl})` }} />
        <div className="scene-vinyl-grooves" />
      </div>
      {adjusting ? <VinylAdjustHud /> : null}
    </>
  )
}

// DJ 聊天面板 — 隐藏自带触发, 用 SceneDjButton 控开关
function SceneDjChat({
  open,
  setOpen,
  p,
}: {
  readonly open: boolean
  readonly setOpen: (v: boolean) => void
  readonly p: Props
}) {
  return (
    <DjChat
      open={open}
      hideTrigger
      onOpen={() => {
        setOpen(true)
      }}
      onClose={() => {
        setOpen(false)
      }}
      language={p.language}
      onPlay={p.onPlay}
      onNext={p.onNext}
      {...(p.song !== undefined ? { currentSong: p.song } : {})}
      {...(p.queueLen !== undefined ? { queueLen: p.queueLen } : {})}
    />
  )
}

// 色差 + 颗粒 + 暗角 (z-index 20-26, 覆在所有内容上方)
function SceneFx() {
  return (
    <>
      <div className="scene-vignette" />
      <div className="scene-grain" />
      <div className="scene-chroma" />
    </>
  )
}

// ─── mic 旁字幕 (右中,跟 mic 底沿对齐) ───────────────────────────────────
// 优先级 3 层: DJ 说话 > 当前歌词 > 歌名·歌手 (常驻 banner, 歌词没到/没歌词时填空)
// label 也跟着切, 让用户一眼知道是哪类:
//   DJ      → djLabel (默认 "DJ · 夜间电台")
//   歌词    → "♪ 歌词"
//   歌信息  → "♫ 正在播放"

type SongRef = { readonly title: string; readonly artist: string }
type SubtitleLine = {
  readonly kind: 'dj' | 'lrc' | 'song'
  readonly label: string
  readonly text: string
}

function songRefFromApi(song: ApiSong | undefined): SongRef | null {
  if (song === undefined) return null
  const title = song.title.trim()
  const artist = song.artists
    .map((a) => a.name)
    .join(' / ')
    .trim()
  if (title.length === 0) return null
  return { title, artist }
}

function pickSubtitleLine(
  djText: string | null,
  lrcText: string | null,
  songRef: SongRef | null,
  djLabel: string,
): SubtitleLine | null {
  const dj = djText?.trim() ?? ''
  if (dj.length > 0) return { kind: 'dj', label: djLabel, text: `“${dj}”` }
  const lrc = lrcText?.trim() ?? ''
  if (lrc.length > 0) return { kind: 'lrc', label: '♪ 歌词', text: lrc }
  if (songRef !== null) {
    const text = songRef.artist.length > 0 ? `${songRef.title} · ${songRef.artist}` : songRef.title
    return { kind: 'song', label: '♫ 正在播放', text }
  }
  return null
}

function SceneDjSubtitle({
  djText,
  lrcText,
  songRef,
  djLabel,
}: {
  readonly djText: string | null
  readonly lrcText: string | null
  readonly songRef: SongRef | null
  readonly djLabel: string
}) {
  const line = pickSubtitleLine(djText, lrcText, songRef, djLabel)
  if (line === null) return null
  return (
    <div className="scene-dj-text" aria-live="polite" role="status">
      <div className="scene-dj-label">{line.label}</div>
      <div className="scene-dj-line" key={`${line.kind}:${line.text}`}>
        {line.text}
      </div>
    </div>
  )
}

// ─── 顶栏 chip + 设置/搜索 ────────────────────────────────────────────────

type TFn = LanguageHook['t']

function SceneTopBar({
  onOpenSettings,
  onOpenCmdk,
  t,
}: {
  readonly onOpenSettings: () => void
  readonly onOpenCmdk: () => void
  readonly t: TFn
}) {
  return (
    <div className="scene-topbar">
      <div className="scene-chip-group">
        <span className="scene-chip">
          <span className="scene-chip-clock">{currentTimeShort()}</span>
          <span className="dim">{currentDayShort()}</span>
        </span>
      </div>
      <div className="scene-chip-group">
        <button
          type="button"
          className="scene-icon-btn"
          onClick={onOpenCmdk}
          aria-label={t('search')}
          title={`${t('search')}  ⌘K`}
        >
          ⌕
        </button>
        <button
          type="button"
          className="scene-icon-btn"
          onClick={onOpenSettings}
          aria-label={t('settings')}
          title={t('settings')}
        >
          ⚙
        </button>
      </div>
    </div>
  )
}

function currentTimeShort(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function currentDayShort(): string {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return days[new Date().getDay()] ?? ''
}

// ─── 底部 transport chip ──────────────────────────────────────────────────

type TransportLabels = {
  readonly prev: string
  readonly next: string
  readonly play: string
  readonly pause: string
  readonly idle: string
}

function transportLabels(t: TFn): TransportLabels {
  const isEn = t('settingsWeather') === 'Weather'
  return isEn
    ? { prev: 'Previous', next: 'Next', play: 'Play', pause: 'Pause', idle: 'Pick a song to start' }
    : { prev: '上一首', next: '下一首', play: '播放', pause: '暂停', idle: '挑一首开始吧' }
}

function SceneTransport({
  song,
  playing,
  onTogglePlay,
  onPrev,
  onNext,
  t,
}: {
  readonly song: ApiSong | undefined
  readonly playing: boolean
  readonly onTogglePlay: () => void
  readonly onPrev: () => void
  readonly onNext: () => void
  readonly t: TFn
}) {
  const t10n = transportLabels(t)
  return (
    <div className="scene-bottombar">
      <div className="scene-transport">
        <TransportMeta song={song} idleLabel={t10n.idle} />
        <TransportControls
          playing={playing}
          t10n={t10n}
          onPrev={onPrev}
          onTogglePlay={onTogglePlay}
          onNext={onNext}
        />
      </div>
    </div>
  )
}

function TransportMeta({
  song,
  idleLabel,
}: {
  readonly song: ApiSong | undefined
  readonly idleLabel: string
}) {
  if (song === undefined) {
    return (
      <div className="scene-transport-meta">
        <span className="scene-transport-artist">{idleLabel}</span>
      </div>
    )
  }
  const artistLabel = song.artists.map((a) => a.name).join(' / ')
  return (
    <div className="scene-transport-meta">
      <span className="scene-transport-title">{song.title}</span>
      <span className="scene-transport-sep">·</span>
      <span className="scene-transport-artist">{artistLabel}</span>
    </div>
  )
}

function TransportControls({
  playing,
  t10n,
  onPrev,
  onTogglePlay,
  onNext,
}: {
  readonly playing: boolean
  readonly t10n: TransportLabels
  readonly onPrev: () => void
  readonly onTogglePlay: () => void
  readonly onNext: () => void
}) {
  return (
    <div className="scene-transport-controls">
      <button
        type="button"
        className="scene-transport-btn"
        onClick={onPrev}
        aria-label={t10n.prev}
        title={t10n.prev}
      >
        ⏮
      </button>
      <button
        type="button"
        className="scene-transport-btn primary"
        onClick={onTogglePlay}
        aria-label={playing ? t10n.pause : t10n.play}
        title={playing ? t10n.pause : t10n.play}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <button
        type="button"
        className="scene-transport-btn"
        onClick={onNext}
        aria-label={t10n.next}
        title={t10n.next}
      >
        ⏭
      </button>
    </div>
  )
}

// ─── 左下退出按钮 (开窗回 browse) ─────────────────────────────────────────

function ExitListenBtn({ onExit, title }: { readonly onExit: () => void; readonly title: string }) {
  return (
    <div className="scene-corner-left">
      <button
        type="button"
        className="scene-icon-btn"
        onClick={onExit}
        aria-label={title}
        title={title}
      >
        ⊘
      </button>
    </div>
  )
}

// ─── 右下 DJ 触发按钮 ─────────────────────────────────────────────────────

function SceneDjButton({
  active,
  onToggle,
}: {
  readonly active: boolean
  readonly onToggle: () => void
}) {
  return (
    <div className="scene-corner-right">
      <button
        type="button"
        className="scene-dj-trigger"
        onClick={onToggle}
        aria-label={active ? '关闭 DJ 对话' : '跟 DJ 对话'}
        title="跟 DJ 对话"
      >
        <span className="scene-dj-trigger-label">{active ? '×' : 'DJ'}</span>
        {active ? null : <span className="scene-dj-trigger-dot" />}
      </button>
    </div>
  )
}

// ─── 音量浮控 (Listen 模式左下偏上, ⊘ 退出按钮上方) ──────────────────────

function SceneVolume({
  volume,
  muted,
  onSetVolume,
  onToggleMute,
}: {
  readonly volume: number
  readonly muted: boolean
  readonly onSetVolume: (v: number) => void
  readonly onToggleMute: () => void
}) {
  const shown = muted ? 0 : volume
  return (
    <div className="scene-volume">
      <button
        type="button"
        className="scene-volume-btn"
        onClick={onToggleMute}
        aria-label={muted ? '取消静音' : '静音'}
        title={muted ? '取消静音' : '静音'}
      >
        {muted || volume === 0 ? '⌀' : '♪'}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={shown}
        onChange={(e) => {
          onSetVolume(parseFloat(e.target.value))
        }}
        className="scene-volume-slider"
        aria-label="音量"
      />
    </div>
  )
}
