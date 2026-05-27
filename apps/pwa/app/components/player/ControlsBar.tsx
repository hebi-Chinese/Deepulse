'use client'

import { formatTime, MODE_LABEL, type PlayMode } from './types'

type Props = {
  readonly playing: boolean
  readonly hasSong: boolean
  readonly queueEmpty: boolean
  readonly currentTimeSec: number
  readonly durationSec: number
  readonly volume: number
  readonly muted: boolean
  readonly mode: PlayMode
  readonly onPrev: () => void
  readonly onNext: () => void
  readonly onTogglePlay: () => void
  readonly onSeek: (sec: number) => void
  readonly onVolumeChange: (v: number) => void
  readonly onToggleMute: () => void
  readonly onCycleMode: () => void
}

export function ControlsBar(props: Props) {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-40">
      <div className="max-w-6xl mx-auto flex items-center gap-4 px-5 py-3 rounded-2xl bg-white/8 backdrop-blur-2xl border border-white/12 shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
        <TransportButtons
          onPrev={props.onPrev}
          onNext={props.onNext}
          onTogglePlay={props.onTogglePlay}
          playing={props.playing}
          hasSong={props.hasSong}
          queueEmpty={props.queueEmpty}
        />
        <SeekSlider
          currentTimeSec={props.currentTimeSec}
          durationSec={props.durationSec}
          disabled={!props.hasSong}
          onSeek={props.onSeek}
        />
        <button
          type="button"
          onClick={props.onCycleMode}
          className="text-xs text-white/65 hover:text-white px-2 py-1 rounded-md hover:bg-white/8 transition-colors min-w-[4rem]"
        >
          {MODE_LABEL[props.mode]}
        </button>
        <VolumeControl
          volume={props.volume}
          muted={props.muted}
          onChange={props.onVolumeChange}
          onToggleMute={props.onToggleMute}
        />
      </div>
    </div>
  )
}

function TransportButtons(props: {
  readonly onPrev: () => void
  readonly onNext: () => void
  readonly onTogglePlay: () => void
  readonly playing: boolean
  readonly hasSong: boolean
  readonly queueEmpty: boolean
}) {
  return (
    <>
      <button
        type="button"
        onClick={props.onPrev}
        disabled={props.queueEmpty}
        className="text-xl text-white/75 disabled:opacity-25 hover:text-white transition-colors"
        aria-label="上一首"
      >
        ⏮
      </button>
      <button
        type="button"
        onClick={props.onTogglePlay}
        disabled={!props.hasSong}
        className="text-3xl text-white disabled:opacity-25 hover:scale-110 transition-transform w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        aria-label={props.playing ? '暂停' : '播放'}
      >
        {props.playing ? '⏸' : '▶'}
      </button>
      <button
        type="button"
        onClick={props.onNext}
        disabled={props.queueEmpty}
        className="text-xl text-white/75 disabled:opacity-25 hover:text-white transition-colors"
        aria-label="下一首"
      >
        ⏭
      </button>
    </>
  )
}

function SeekSlider(props: {
  readonly currentTimeSec: number
  readonly durationSec: number
  readonly disabled: boolean
  readonly onSeek: (sec: number) => void
}) {
  return (
    <div className="flex-1 flex items-center gap-3">
      <span className="text-xs text-white/55 w-10 text-right tabular-nums">
        {formatTime(props.currentTimeSec)}
      </span>
      <input
        type="range"
        aria-label="播放进度"
        min={0}
        max={props.durationSec > 0 ? props.durationSec : 0}
        step={0.1}
        value={props.currentTimeSec}
        onChange={(e) => {
          props.onSeek(Number(e.target.value))
        }}
        disabled={props.disabled}
        className="flex-1 accent-white"
      />
      <span className="text-xs text-white/55 w-10 tabular-nums">
        {formatTime(props.durationSec)}
      </span>
    </div>
  )
}

function VolumeControl(props: {
  readonly volume: number
  readonly muted: boolean
  readonly onChange: (v: number) => void
  readonly onToggleMute: () => void
}) {
  // pr-3 给 slider thumb 留位 (Chrome 默认 thumb 会越界 ~10px,否则贴外溢出)
  return (
    <div className="flex items-center gap-2 w-32 pr-3">
      <button
        type="button"
        onClick={props.onToggleMute}
        className="text-white/70 hover:text-white transition-colors text-sm"
        aria-label={props.muted ? '取消静音' : '静音'}
      >
        {props.muted ? '🔇' : '🔊'}
      </button>
      <input
        type="range"
        aria-label="音量"
        min={0}
        max={1}
        step={0.01}
        value={props.muted ? 0 : props.volume}
        onChange={(e) => {
          props.onChange(Number(e.target.value))
        }}
        className="flex-1 accent-white min-w-0"
      />
    </div>
  )
}
