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
  readonly insertNext: (song: ApiSong) => void
  readonly removeFromQueue: (id: string) => void
  readonly moveInQueue: (fromId: string, toId: string) => void
  readonly clearQueue: () => void
  // PRD-008 (2026-06-14): personalized (个性化) 模式 effect 异步拉到 5 首后调用. cap 防 queue 失控
  readonly appendQueue: (songs: readonly ApiSong[], cap: number) => void
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
  // stateRef 给 toggleMute 用 — 不能在 setState updater 里写 audio.volume (React 可能重跑 updater)
  // 用 ref 镜像让 callback 读到 current state, 写 DOM 在 setState 之外
  const stateRef = useRef(state)
  stateRef.current = state
  const audioActions = useAudioActions(audioRef, setState, stateRef)

  const actions: PlayerActions = { ...queueActions, ...transportActions, ...audioActions }

  // PRD-008 (2026-06-14): personalized (个性化) 模式下监听 currentIndex, 听到最后一首
  // 时预拉 5 首 append, 实现无缝切换
  usePersonalizedAutoAppend(state, actions)

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

// PRD-008 (2026-06-14): personalized (个性化) 模式预拉 5 首 append, 无缝切换
//   触发: mode=personalized + currentIndex >= queue.length-1
//   (覆盖 "听最后一首预拉" + "queue 空冷启动" 两 case)
// 注 deps 只用 primitive (mode / currentIndex / queue.length),
//   不放 queue 数组本身 (ref 变化太频繁会反复跑)
const PERSONALIZED_QUEUE_CAP = 150
function usePersonalizedAutoAppend(state: PlayerState, actions: PlayerActions): void {
  const { mode, currentIndex, queue } = state
  const queueLen = queue.length
  // queue 引用需要给 effect 内部读, 但不进 deps. 用 ref 镜像
  const queueRef = useRef(queue)
  queueRef.current = queue
  useEffect(() => {
    if (mode !== 'personalized') return
    if (currentIndex < queueLen - 1) return
    const excludeIds = queueRef.current.map((s) => s.id)
    api
      .personalizedBatch(excludeIds)
      .then((res) => {
        if (res.ok && res.songs.length > 0) {
          actions.appendQueue(res.songs, PERSONALIZED_QUEUE_CAP)
        } else if (!res.ok) {
          // 没登录 / 没 snapshot → 设 error, UI 用 error 显示提示
          actions.setError(`个性化模式: ${res.reason}`)
        }
      })
      .catch((err: unknown) => {
        console.warn('[usePersonalizedAutoAppend] fetch failed:', err)
      })
  }, [mode, currentIndex, queueLen])
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
  // 切歌 (audioUrl 变) 才重设 src + play().
  // muted/volume 故意排除 deps: 它们由 setVolume/toggleMute action 直接改 audio.volume,
  // 如果进 deps 就会"音量一动当前歌从头播"(用户痛点). 这里只在切歌瞬间读一次当前 volume.
  // (项目 lint 未启用 react-hooks/exhaustive-deps, 注释仅作给后人提醒)
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

type QueueActions = Pick<
  PlayerActions,
  | 'playSong'
  | 'queueSong'
  | 'insertNext'
  | 'removeFromQueue'
  | 'moveInQueue'
  | 'clearQueue'
  | 'appendQueue'
>

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
  const insertNext = useCallback(
    (song: ApiSong) => {
      setState((s) => insertAsNext(s, song))
    },
    [setState],
  )
  const removeFromQueue = useCallback(
    (id: string) => {
      setState((s) => removeQueueItem(s, id))
    },
    [setState],
  )
  const moveInQueue = useCallback(
    (fromId: string, toId: string) => {
      setState((s) => moveQueueItem(s, fromId, toId))
    },
    [setState],
  )
  const clearQueue = useCallback(() => {
    setState((s) => clearQueueKeepCurrent(s))
  }, [setState])
  // PRD-008: personalized effect 异步拉到 5 首后调本 action append + cap 裁头
  const appendQueue = useCallback(
    (songs: readonly ApiSong[], cap: number) => {
      setState((s) => appendQueueWithCap(s, songs, cap))
    },
    [setState],
  )
  return {
    playSong,
    queueSong,
    insertNext,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    appendQueue,
  }
}

// ────────────────────────────────────────────────────────────────────────
// transport actions (prev/next/ended/togglePlay/seek/cycleMode)

type TransportActions = Pick<
  PlayerActions,
  'togglePlay' | 'handlePrev' | 'handleNext' | 'handleEnded' | 'onSeek' | 'cycleMode'
>

function useTransportActions(audioRef: AudioRef, setState: SetState): TransportActions {
  const stepActions = useStepActions(setState)
  const playbackActions = usePlaybackActions(audioRef, setState)
  const seekModeActions = useSeekModeActions(audioRef, setState)

  return { ...playbackActions, ...stepActions, ...seekModeActions }
}

type StepActions = Pick<TransportActions, 'handlePrev' | 'handleNext'>

function useStepActions(setState: SetState): StepActions {
  const handleNext = useCallback(() => {
    setState((s) => stepNext(s))
  }, [setState])
  const handlePrev = useCallback(() => {
    setState((s) => stepPrev(s))
  }, [setState])
  return { handlePrev, handleNext }
}

type PlaybackActions = Pick<TransportActions, 'togglePlay' | 'handleEnded'>

function usePlaybackActions(audioRef: AudioRef, setState: SetState): PlaybackActions {
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

  return { togglePlay, handleEnded }
}

type SeekModeActions = Pick<TransportActions, 'onSeek' | 'cycleMode'>

function useSeekModeActions(audioRef: AudioRef, setState: SetState): SeekModeActions {
  const onSeek = useCallback(
    (sec: number) => {
      const audio = audioRef.current
      if (audio !== null) audio.currentTime = sec
    },
    [audioRef],
  )

  const cycleMode = useCallback(() => {
    setState((s) => {
      const newMode = nextMode(s.mode)
      // PRD-007 V3: 切到 shuffle 时一次性 Fisher-Yates 打乱 queue (mutate),
      // 之后 stepNext 走 order 同款逻辑. 不再每次 next 现场随机.
      if (newMode === 'shuffle' && s.mode !== 'shuffle') {
        return shuffleQueueOnce(s)
      }
      return { ...s, mode: newMode }
    })
  }, [setState])

  return { onSeek, cycleMode }
}

// ────────────────────────────────────────────────────────────────────────
// audio-state actions (volume/mute/onTimeUpdate/onPlay/onPause/setError)

type AudioActions = Pick<
  PlayerActions,
  'setVolume' | 'toggleMute' | 'onTimeUpdate' | 'onPlay' | 'onPause' | 'setError'
>

function useAudioActions(
  audioRef: AudioRef,
  setState: SetState,
  stateRef: React.RefObject<PlayerState>,
): AudioActions {
  const setVolume = useCallback(
    (v: number) => {
      const audio = audioRef.current
      setState((s) => ({ ...s, volume: v, muted: false }))
      if (audio !== null) audio.volume = v
    },
    [audioRef, setState],
  )

  const toggleMute = useCallback(() => {
    // 从 ref 读真当前 state 而不是 updater 里 — updater 必须纯, DOM 写在 setState 之外
    const curr = stateRef.current
    const muted = !curr.muted
    const audio = audioRef.current
    if (audio !== null) audio.volume = muted ? 0 : curr.volume
    setState((s) => ({ ...s, muted }))
  }, [audioRef, setState, stateRef])

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

// 把 song 插到当前曲后面 (current + 1). 已在播 / 已在 next 槽位 → 不动. 没当前曲 → 退化为末尾追加.
function insertAsNext(s: PlayerState, song: ApiSong): PlayerState {
  if (s.currentIndex < 0) return appendUnique(s, song)
  const existingIdx = s.queue.findIndex((q) => q.id === song.id)
  if (existingIdx === s.currentIndex) return s
  if (existingIdx === s.currentIndex + 1) return s
  const removed = existingIdx >= 0 ? s.queue.filter((_, i) => i !== existingIdx) : s.queue
  const adjustedCurrent =
    existingIdx >= 0 && existingIdx < s.currentIndex ? s.currentIndex - 1 : s.currentIndex
  const insertAt = adjustedCurrent + 1
  const newQueue = [...removed.slice(0, insertAt), song, ...removed.slice(insertAt)]
  return { ...s, queue: newQueue, currentIndex: adjustedCurrent }
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

// 拖拽重排: 把 fromId 拖到 toId 的位置. 维持 currentIndex 指向同一首歌
function moveQueueItem(s: PlayerState, fromId: string, toId: string): PlayerState {
  if (fromId === toId) return s
  const fromIdx = s.queue.findIndex((q) => q.id === fromId)
  const toIdx = s.queue.findIndex((q) => q.id === toId)
  if (fromIdx < 0 || toIdx < 0) return s
  const playingId = s.currentIndex >= 0 ? (s.queue[s.currentIndex]?.id ?? null) : null
  const reordered = [...s.queue]
  const [moved] = reordered.splice(fromIdx, 1)
  if (moved === undefined) return s
  reordered.splice(toIdx, 0, moved)
  // 用歌 id 重新定位 currentIndex (而不是算偏移 — 边界 case 多易错)
  const newCurrent = playingId !== null ? reordered.findIndex((q) => q.id === playingId) : -1
  return { ...s, queue: reordered, currentIndex: newCurrent }
}

// 清空: 当前播放的留下 (停下一首), 没在播就全清
function clearQueueKeepCurrent(s: PlayerState): PlayerState {
  if (s.currentIndex < 0) return { ...s, queue: [] }
  const playing = s.queue[s.currentIndex]
  if (playing === undefined) return { ...s, queue: [], currentIndex: -1 }
  return { ...s, queue: [playing], currentIndex: 0 }
}

function stepNext(s: PlayerState): PlayerState {
  if (s.queue.length === 0) return s
  let next = s.currentIndex + 1
  if (next >= s.queue.length) {
    // PRD-007 V3: shuffle 切到时一次性打乱 queue, 之后 stepNext 跟 order 同款
    // PRD-008 V2: personalized 到队尾不动, 让 effect 异步 fetch 5 首再 append
    //   (effect 会预拉, 但万一 fetch 还没返回就到尾了, 这次 stepNext 暂停)
    if (s.mode === 'loop') next = 0
    else if (s.mode === 'personalized') return s
    else next = -1
  }
  return { ...s, currentIndex: next }
}

function stepPrev(s: PlayerState): PlayerState {
  if (s.queue.length === 0) return s
  const prev = s.currentIndex - 1
  return { ...s, currentIndex: prev < 0 ? s.queue.length - 1 : prev }
}

// PRD-007 V3 (2026-06-14): 切到 shuffle 时一次性 Fisher-Yates 打乱 queue.
// 把当前在播的歌换到 index 0, 让"当前播放"位置不被切歌打断.
// 之后 stepNext/stepPrev 跟 order 同款按 index 走.
function shuffleQueueOnce(s: PlayerState): PlayerState {
  if (s.queue.length <= 1) return { ...s, mode: 'shuffle' }
  const currentSong = s.currentIndex >= 0 ? s.queue[s.currentIndex] : undefined
  const shuffled = fisherYates([...s.queue])
  if (currentSong === undefined) {
    return { ...s, mode: 'shuffle', queue: shuffled, currentIndex: -1 }
  }
  // 把当前歌换到 index 0, 维持"当前在放"不被切
  const idxInShuffled = shuffled.findIndex((sg) => sg.id === currentSong.id)
  if (idxInShuffled > 0) {
    const tmp = shuffled[0]
    if (tmp !== undefined) {
      shuffled[0] = currentSong
      shuffled[idxInShuffled] = tmp
    }
  }
  return { ...s, mode: 'shuffle', queue: shuffled, currentIndex: 0 }
}

// Fisher-Yates 洗牌 (in-place, 返回同一引用)
function fisherYates<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i] as T
    arr[i] = arr[j] as T
    arr[j] = tmp
  }
  return arr
}

// PRD-008 (2026-06-14): append (追加) songs 进 queue + 去重 + 超 cap 裁头.
//   cold start (冷启动: queue 之前空 currentIndex=-1) → append 完自动定位 0 开始播,
//   对应用户原话 "没有当前歌, 直接开始随机五首然后往下走".
function appendQueueWithCap(s: PlayerState, songs: readonly ApiSong[], cap: number): PlayerState {
  // 去重: songs 跳过 queue 里已有的
  const existingIds = new Set(s.queue.map((q) => q.id))
  const fresh = songs.filter((sg) => !existingIds.has(sg.id))
  if (fresh.length === 0) return s
  const newQueue = [...s.queue, ...fresh]
  // 冷启动: queue 之前是空, append 完自动定位 index 0 开始播
  let newCurrent = s.currentIndex
  if (s.currentIndex < 0 && newQueue.length > 0) {
    newCurrent = 0
  }
  if (newQueue.length <= cap) {
    return { ...s, queue: newQueue, currentIndex: newCurrent }
  }
  // 超 cap, 裁头 (老的删, currentIndex 跟着减保持指向同一首歌)
  const trim = newQueue.length - cap
  return {
    ...s,
    queue: newQueue.slice(trim),
    currentIndex: Math.max(0, newCurrent - trim),
  }
}

function nextMode(current: PlayMode): PlayMode {
  const idx = PLAY_MODES.indexOf(current)
  return PLAY_MODES[(idx + 1) % PLAY_MODES.length] ?? 'order'
}
