// usePlayerLogic · 封装 Player 的全部状态 + audio ref + effect + 回调
// Player.tsx 只 orchestration,所有逻辑收敛在这里

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api, type ApiSong } from '../../lib/api'
import { findActiveLineIndex, parseLrc } from '../../lib/lrc'

import { loadInitialState, persist } from './playerStorage'
import { describeError, PLAY_MODES, type PlayMode, type PlayerState } from './types'

type SetState = React.Dispatch<React.SetStateAction<PlayerState>>
type AudioRef = React.RefObject<HTMLAudioElement | null>

export type PlayerActions = {
  readonly playSong: (song: ApiSong) => void
  readonly queueSong: (song: ApiSong) => void
  readonly removeFromQueue: (id: string) => void
  readonly togglePlay: () => void
  readonly handlePrev: () => void
  readonly handleNext: () => void
  readonly handleEnded: () => void
  readonly onSeek: (sec: number) => void
  readonly setVolume: (v: number) => void
  readonly toggleMute: () => void
  readonly cycleMode: () => void
  readonly onTimeUpdate: () => void
  readonly onPlay: () => void
  readonly onPause: () => void
  readonly setError: (msg: string | undefined) => void
}

export type PlayerLogic = {
  readonly state: PlayerState
  readonly audioRef: AudioRef
  readonly currentSong: ApiSong | undefined
  readonly activeLrcIndex: number
  readonly actions: PlayerActions
}

export function usePlayerLogic(): PlayerLogic {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // SSR 安全: 服务端拿不到 localStorage,hydrate 时 INITIAL_STATE;客户端 mount 后 effect 再合并
  const [state, setState] = useState<PlayerState>(loadInitialState)
  usePersistState(state)

  const currentSong = useMemo<ApiSong | undefined>(
    () => (state.currentIndex >= 0 ? state.queue[state.currentIndex] : undefined),
    [state.queue, state.currentIndex],
  )

  const activeLrcIndex = useMemo(
    () => findActiveLineIndex(state.lrcLines, state.currentTimeSec * 1000),
    [state.lrcLines, state.currentTimeSec],
  )

  useTrackLoader(currentSong, setState)
  useAudioSourceSync({
    audioRef,
    audioUrl: state.audioUrl,
    muted: state.muted,
    volume: state.volume,
    setState,
  })

  const queueActions = useQueueActions(setState)
  const transportActions = useTransportActions(audioRef, setState)
  const audioActions = useAudioActions(audioRef, setState)

  const actions: PlayerActions = { ...queueActions, ...transportActions, ...audioActions }

  return { state, audioRef, currentSong, activeLrcIndex, actions }
}

// ────────────────────────────────────────────────────────────────────────
// effects

// queue / mode / volume / muted 变化时写 localStorage
// 故意不 dep 整个 state — 每帧 currentTime tick 不该写盘
function usePersistState(state: PlayerState): void {
  const { queue, mode, volume, muted } = state
  useEffect(() => {
    persist({ queue, mode, volume, muted })
  }, [queue, mode, volume, muted])
}

function useTrackLoader(currentSong: ApiSong | undefined, setState: SetState): void {
  useEffect(() => {
    if (currentSong === undefined) return
    let cancelled = false

    // 本地导入歌:直接喂 blob URL,跳过 NCM fetch 和歌词
    if (currentSong.localUrl !== undefined) {
      setState((s) => ({
        ...s,
        audioUrl: currentSong.localUrl,
        audioLoading: false,
        lrcLines: [],
        lrcLoading: false,
        error: undefined,
      }))
      return () => {
        cancelled = true
      }
    }

    setState((s) => ({ ...s, audioLoading: true, lrcLoading: true, error: undefined }))

    Promise.all([api.songUrl(currentSong.id, 'standard'), api.lyric(currentSong.id)])
      .then(([urlRes, lrc]) => {
        if (cancelled) return
        setState((s) => ({
          ...s,
          audioUrl: urlRes.url,
          audioLoading: false,
          lrcLines: parseLrc(lrc.raw),
          lrcLoading: false,
        }))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState((s) => ({
          ...s,
          audioUrl: undefined,
          audioLoading: false,
          lrcLoading: false,
          error: describeError(err),
        }))
      })

    return () => {
      cancelled = true
    }
  }, [currentSong, setState])
}

type AudioSourceSyncOptions = {
  readonly audioRef: AudioRef
  readonly audioUrl: string | undefined
  readonly muted: boolean
  readonly volume: number
  readonly setState: SetState
}

function useAudioSourceSync(opts: AudioSourceSyncOptions): void {
  const { audioRef, audioUrl, muted, volume, setState } = opts
  // 切歌 (audioUrl 变) 才重设 src + play()。
  // 音量/静音由 setVolume/toggleMute action 直接改 audio.volume,**不能进 dep**,
  // 否则 volume 一变就会 audio.src=audioUrl → 当前歌从头播 (用户痛点)。
  useEffect(() => {
    const audio = audioRef.current
    if (audio === null || audioUrl === undefined) return
    audio.src = audioUrl
    audio.volume = muted ? 0 : volume
    audio.play().catch((err: unknown) => {
      setState((s) => ({ ...s, error: `播放失败: ${describeError(err)}`, playing: false }))
    })
  }, [audioUrl, audioRef, setState])
}

// ────────────────────────────────────────────────────────────────────────
// queue actions

type QueueActions = Pick<PlayerActions, 'playSong' | 'queueSong' | 'removeFromQueue'>

function useQueueActions(setState: SetState): QueueActions {
  const playSong = useCallback(
    (song: ApiSong) => {
      setState((s) => enqueueAndPlay(s, song))
    },
    [setState],
  )
  const queueSong = useCallback(
    (song: ApiSong) => {
      setState((s) => appendUnique(s, song))
    },
    [setState],
  )
  const removeFromQueue = useCallback(
    (id: string) => {
      setState((s) => removeQueueItem(s, id))
    },
    [setState],
  )
  return { playSong, queueSong, removeFromQueue }
}

// ────────────────────────────────────────────────────────────────────────
// transport actions (prev/next/ended/togglePlay/seek/cycleMode)

type TransportActions = Pick<
  PlayerActions,
  'togglePlay' | 'handlePrev' | 'handleNext' | 'handleEnded' | 'onSeek' | 'cycleMode'
>

function useTransportActions(audioRef: AudioRef, setState: SetState): TransportActions {
  const handleNext = useCallback(() => {
    setState((s) => stepNext(s))
  }, [setState])
  const handlePrev = useCallback(() => {
    setState((s) => stepPrev(s))
  }, [setState])
  // 单曲循环: 副作用(audio.play)必须在 setState 外,否则 React StrictMode 会双播.
  // setState 用同步 read,所以这里直接读 audioRef + 走纯 transformer.
  const handleEnded = useCallback(() => {
    const audio = audioRef.current
    setState((current) => {
      if (current.mode === 'single' && audio !== null) {
        // schedule outside reducer (微任务,等 setState 返回)
        queueMicrotask(() => {
          audio.currentTime = 0
          void audio.play().catch((err: unknown) => {
            setState((s) => ({ ...s, error: `自动续播失败: ${describeError(err)}` }))
          })
        })
        return current
      }
      return stepNext(current)
    })
  }, [audioRef, setState])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (audio === null) return
    if (audio.paused) {
      void audio.play().catch((err: unknown) => {
        setState((s) => ({ ...s, error: `播放失败: ${describeError(err)}` }))
      })
    } else {
      audio.pause()
    }
  }, [audioRef, setState])

  const onSeek = useCallback(
    (sec: number) => {
      const audio = audioRef.current
      if (audio !== null) audio.currentTime = sec
    },
    [audioRef],
  )

  const cycleMode = useCallback(() => {
    setState((s) => ({ ...s, mode: nextMode(s.mode) }))
  }, [setState])

  return { togglePlay, handlePrev, handleNext, handleEnded, onSeek, cycleMode }
}

// ────────────────────────────────────────────────────────────────────────
// audio-state actions (volume/mute/onTimeUpdate/onPlay/onPause/setError)

type AudioActions = Pick<
  PlayerActions,
  'setVolume' | 'toggleMute' | 'onTimeUpdate' | 'onPlay' | 'onPause' | 'setError'
>

function useAudioActions(audioRef: AudioRef, setState: SetState): AudioActions {
  const setVolume = useCallback(
    (v: number) => {
      const audio = audioRef.current
      setState((s) => ({ ...s, volume: v, muted: false }))
      if (audio !== null) audio.volume = v
    },
    [audioRef, setState],
  )

  const toggleMute = useCallback(() => {
    const audio = audioRef.current
    setState((s) => {
      const muted = !s.muted
      if (audio !== null) audio.volume = muted ? 0 : s.volume
      return { ...s, muted }
    })
  }, [audioRef, setState])

  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    if (audio === null) return
    setState((s) => ({
      ...s,
      currentTimeSec: audio.currentTime,
      durationSec: audio.duration,
    }))
  }, [audioRef, setState])

  const onPlay = useCallback(() => {
    setState((s) => ({ ...s, playing: true }))
  }, [setState])
  const onPause = useCallback(() => {
    setState((s) => ({ ...s, playing: false }))
  }, [setState])
  const setError = useCallback(
    (msg: string | undefined) => {
      setState((s) => ({ ...s, error: msg }))
    },
    [setState],
  )

  return { setVolume, toggleMute, onTimeUpdate, onPlay, onPause, setError }
}

// ────────────────────────────────────────────────────────────────────────
// pure state transformers (易测 + 易推理)

function enqueueAndPlay(s: PlayerState, song: ApiSong): PlayerState {
  const exists = s.queue.findIndex((q) => q.id === song.id)
  if (exists >= 0) return { ...s, currentIndex: exists }
  const newQueue = [...s.queue, song]
  return { ...s, queue: newQueue, currentIndex: newQueue.length - 1 }
}

function appendUnique(s: PlayerState, song: ApiSong): PlayerState {
  if (s.queue.some((q) => q.id === song.id)) return s
  return { ...s, queue: [...s.queue, song] }
}

function removeQueueItem(s: PlayerState, id: string): PlayerState {
  const idx = s.queue.findIndex((q) => q.id === id)
  if (idx < 0) return s
  const newQueue = s.queue.filter((_, i) => i !== idx)
  let newIdx = s.currentIndex
  if (idx < s.currentIndex) newIdx -= 1
  else if (idx === s.currentIndex) {
    newIdx = newQueue.length > 0 ? Math.min(newIdx, newQueue.length - 1) : -1
  }
  return { ...s, queue: newQueue, currentIndex: newIdx }
}

function stepNext(s: PlayerState): PlayerState {
  if (s.queue.length === 0) return s
  let next = s.currentIndex + 1
  if (s.mode === 'shuffle') {
    next = Math.floor(Math.random() * s.queue.length)
  } else if (next >= s.queue.length) {
    next = s.mode === 'loop' ? 0 : -1
  }
  return { ...s, currentIndex: next }
}

function stepPrev(s: PlayerState): PlayerState {
  if (s.queue.length === 0) return s
  const prev = s.currentIndex - 1
  return { ...s, currentIndex: prev < 0 ? s.queue.length - 1 : prev }
}

function nextMode(current: PlayMode): PlayMode {
  const idx = PLAY_MODES.indexOf(current)
  return PLAY_MODES[(idx + 1) % PLAY_MODES.length] ?? 'order'
}
