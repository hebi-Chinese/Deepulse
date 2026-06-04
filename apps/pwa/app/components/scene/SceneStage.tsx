'use client'

// SceneStage · Listen 模式的整个沉浸场景
// 替代旧的 RoomScene + ListenSill,直接渲染整张深夜电台 DJ 房:
//   底图 → 窗户(风铃/雨/凝水) → 月光带 → 尘埃 → 真实麦 → DJ 字幕 → viz 律动 → UI chrome
// audio 元素仍由 Player 顶层托管, 这里只消费 state + callback

import { useEffect, useState } from 'react'

import { AtmosphereCanvas } from '../atmosphere/AtmosphereCanvas'
import { DjChat } from '../listen/DjChat'
import { useDjCloud } from '../listen/useDjState'

import { SceneVizBars } from './SceneVizBars'
import { SceneWindow } from './SceneWindow'

import type { ApiSong } from '../../lib/api'
import type { Weather } from '../atmosphere/types'
import type { LanguageHook } from '../settings/useLanguage'

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
  readonly onTogglePlay: () => void
  readonly onPrev: () => void
  readonly onNext: () => void
  readonly onPlay: (s: ApiSong) => void
  readonly onExitListen: () => void
  readonly onOpenSettings: () => void
  readonly onOpenCmdk: () => void
  readonly queueLen?: number
  readonly weather: Weather
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
  // useListenWeatherAdjuster 已提到 Player.tsx 顶层 — Browse 时也能激活,
  // 用户进 Listen 后看到 canvas 已是新坐标
  return (
    <>
      <SceneBackdrop weather={props.weather} />
      <SceneVinyl song={props.song} playing={props.playing} />
      <img className="scene-mic" src="/scene/mic.png" alt="" aria-hidden="true" />
      <SceneDjSubtitle text={djMsg?.text ?? null} djLabel="DJ · 流萤" />
      <SceneVizBars audioRef={props.audioRef} playing={props.playing} />
      <SceneFx />
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
      <SceneWindow weather={weather} />
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

// ─── vinyl 调试模式 ──────────────────────────────────────────────────────
// 触发: URL 加 ?adjust=vinyl
// 操作:
//   方向键      移位      (Shift+方向键 = 大步 1%, 默认 0.2%)
//   + / -       同比缩放
//   [ / ]       只调长轴 (横向)
//   , / .       只调短轴 (纵向)
//   P           console.log 当前 CSS, 写到 .scene-vinyl-wrap 给我复制

type VinylVars = {
  left: number // %
  top: number // %
  w: number // vw
  h: number // vw
}

const DEFAULT_VARS: VinylVars = { left: 56, top: 58, w: 11, h: 4.5 }

function useVinylAdjuster(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const enabled = new URLSearchParams(window.location.search).get('adjust') === 'vinyl'
    if (!enabled) return
    setOn(true)
    const vars: VinylVars = { ...DEFAULT_VARS }
    const onKey = (e: KeyboardEvent): void => {
      if (handleAdjustKey(e, vars)) {
        e.preventDefault()
        applyVinylVars(vars)
      }
    }
    applyVinylVars(vars)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  return on
}

function applyVinylVars(vars: VinylVars): void {
  const root = document.documentElement
  root.style.setProperty('--vinyl-left', `${vars.left.toFixed(2)}%`)
  root.style.setProperty('--vinyl-top', `${vars.top.toFixed(2)}%`)
  root.style.setProperty('--vinyl-w', `${vars.w.toFixed(2)}vw`)
  root.style.setProperty('--vinyl-h', `${vars.h.toFixed(2)}vw`)
}

// 返回 true 表示该按键被处理 (调用方就会 preventDefault + 重 apply)
// 拆成纯函数让 useVinylAdjuster 不再超 50 行 + complexity < 10
function handleAdjustKey(e: KeyboardEvent, vars: VinylVars): boolean {
  const moveStep = e.shiftKey ? 1.0 : 0.2
  const sizeStep = e.shiftKey ? 0.5 : 0.1
  if (handleMoveKey(e.key, vars, moveStep)) return true
  // 缩放键走 e.code 物理位置, 不受中文 IME 全角/半角影响
  if (handleSizeKey(e.code, vars, sizeStep)) return true
  if (e.code === 'KeyP') {
    printVinylVars(vars)
    return true
  }
  return false
}

// 共享给 vinyl + listen-weather 调试模式 — 只动 left/top, 结构化兼容多种 vars
function handleMoveKey(key: string, vars: { left: number; top: number }, step: number): boolean {
  switch (key) {
    case 'ArrowLeft':
      vars.left -= step
      return true
    case 'ArrowRight':
      vars.left += step
      return true
    case 'ArrowUp':
      vars.top -= step
      return true
    case 'ArrowDown':
      vars.top += step
      return true
    default:
      return false
  }
}

function handleSizeKey(code: string, vars: VinylVars, step: number): boolean {
  const z = zoomDelta(code)
  if (z !== 0) {
    vars.w += step * z
    vars.h += step * z * (DEFAULT_VARS.h / DEFAULT_VARS.w)
    return true
  }
  const wd = widthDelta(code)
  if (wd !== 0) {
    vars.w += step * wd
    return true
  }
  const hd = heightDelta(code)
  if (hd !== 0) {
    vars.h += step * hd
    return true
  }
  return false
}

// 用 e.code 物理位置 (Equal/Minus/...) 替代 e.key, 不受 IME 全角/半角影响
function zoomDelta(code: string): -1 | 0 | 1 {
  if (code === 'Equal' || code === 'NumpadAdd') return 1
  if (code === 'Minus' || code === 'NumpadSubtract') return -1
  return 0
}
function widthDelta(code: string): -1 | 0 | 1 {
  if (code === 'BracketRight') return 1
  if (code === 'BracketLeft') return -1
  return 0
}
function heightDelta(code: string): -1 | 0 | 1 {
  if (code === 'Period') return 1
  if (code === 'Comma') return -1
  return 0
}

function printVinylVars(vars: VinylVars): void {
  const css = `--vinyl-left: ${vars.left.toFixed(1)}%; --vinyl-top: ${vars.top.toFixed(1)}%; --vinyl-w: ${vars.w.toFixed(2)}vw; --vinyl-h: ${vars.h.toFixed(2)}vw;`
  // eslint-disable-next-line no-console -- intentional: dev adjust mode
  console.log('[vinyl-adjust]', css)
  window.alert(css)
}

function VinylAdjustHud() {
  return (
    <div className="adjust-hud" aria-hidden="true">
      <div>
        vinyl adjust · <kbd>arrows</kbd> move · <kbd>+/-</kbd> scale · <kbd>[/]</kbd> width ·{' '}
        <kbd>,/.</kbd> height · <kbd>shift</kbd> = big step · <kbd>P</kbd> print
      </div>
    </div>
  )
}

// ─── ?adjust=listen 调试模式 (Listen 模式的天气 canvas 矩形) ─────────────
// 触发: URL 加 ?adjust=listen
// 操作:
//   方向键      移位 (Shift = 大步 1%, 默认 0.2%)
//   + / -       同比缩放
//   [ / ]       只调宽
//   , / .       只调高
//   P           console.log + alert 当前 CSS

type LWVars = { left: number; top: number; w: number; h: number }
const LW_DEFAULT: LWVars = { left: 3, top: 0, w: 52, h: 65 }

// 注: 由 Player.tsx 调用 — Browse / Listen 都激活;
// canvas .scene-weather-canvas 只在 Listen 模式下挂载, 但 CSS var 全局生效
export function useListenWeatherAdjuster(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const enabled = new URLSearchParams(window.location.search).get('adjust') === 'listen'
    if (!enabled) return
    setOn(true)
    const vars: LWVars = { ...LW_DEFAULT }
    const onKey = (e: KeyboardEvent): void => {
      if (handleLwKey(e, vars)) {
        e.preventDefault()
        applyLwVars(vars)
        // AtmosphereCanvas inline px 锁了 width/height, 必须重派 resize 才会重测
        window.dispatchEvent(new Event('resize'))
      }
    }
    applyLwVars(vars)
    document.documentElement.setAttribute('data-adjust-mode', 'listen')
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.removeAttribute('data-adjust-mode')
    }
  }, [])
  return on
}

function applyLwVars(v: LWVars): void {
  const r = document.documentElement
  r.style.setProperty('--listen-weather-left', `${v.left.toFixed(2)}%`)
  r.style.setProperty('--listen-weather-top', `${v.top.toFixed(2)}%`)
  r.style.setProperty('--listen-weather-w', `${v.w.toFixed(2)}%`)
  r.style.setProperty('--listen-weather-h', `${v.h.toFixed(2)}%`)
}

function handleLwKey(e: KeyboardEvent, v: LWVars): boolean {
  // 跟 useBrowseAdjuster 同理 — canvas 占视口比例大, step 默认 1%
  const moveStep = e.shiftKey ? 3 : 1
  const sizeStep = e.shiftKey ? 3 : 1
  if (handleMoveKey(e.key, v, moveStep)) return true
  // e.code 物理位置不受 IME 全角/半角影响 (复用 vinyl 那套 zoom/width/heightDelta)
  if (handleLwSizeKey(e.code, v, sizeStep)) return true
  if (e.code === 'KeyP') {
    printLwVars(v)
    return true
  }
  return false
}

function handleLwSizeKey(code: string, v: LWVars, step: number): boolean {
  const z = zoomDelta(code)
  if (z !== 0) {
    v.w += step * z
    v.h += step * z
    return true
  }
  const wd = widthDelta(code)
  if (wd !== 0) {
    v.w += step * wd
    return true
  }
  const hd = heightDelta(code)
  if (hd !== 0) {
    v.h += step * hd
    return true
  }
  return false
}

function printLwVars(v: LWVars): void {
  const css = `--listen-weather-left: ${v.left.toFixed(1)}%; --listen-weather-top: ${v.top.toFixed(1)}%; --listen-weather-w: ${v.w.toFixed(1)}%; --listen-weather-h: ${v.h.toFixed(1)}%;`
  // eslint-disable-next-line no-console -- intentional: dev adjust mode
  console.log('[listen-weather-adjust]', css)
  window.alert(css)
}

export function ListenWeatherAdjustHud() {
  return (
    <div className="adjust-hud" aria-hidden="true">
      <div>
        listen-weather adjust · <kbd>arrows</kbd> move · <kbd>+/-</kbd> scale · <kbd>[/]</kbd> width
        · <kbd>,/.</kbd> height · <kbd>shift</kbd> = big step · <kbd>P</kbd> print
      </div>
    </div>
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

// ─── DJ 字幕 (右中,跟 mic 底沿对齐) ───────────────────────────────────────

function SceneDjSubtitle({
  text,
  djLabel,
}: {
  readonly text: string | null
  readonly djLabel: string
}) {
  if (text === null) return null
  return (
    <div className="scene-dj-text" aria-live="polite" role="status">
      <div className="scene-dj-label">{djLabel}</div>
      <div className="scene-dj-line" key={text}>
        “{text}”
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
