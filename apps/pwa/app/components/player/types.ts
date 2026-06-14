// Player 模块共享类型 + 常量 + 纯函数 helper

import type { ApiSong } from '../../lib/api'
import type { LrcLine } from '../../lib/lrc'

// PRD-008 (2026-06-14): 加 'personalized' (个性化) — 听最后一首预拉 5 首 (50% 收藏 + 50% NCM 推荐), cap 150
export type PlayMode = 'order' | 'loop' | 'single' | 'shuffle' | 'personalized'

export const PLAY_MODES: readonly PlayMode[] = [
  'order',
  'loop',
  'single',
  'shuffle',
  'personalized',
]

export const MODE_LABEL: Record<PlayMode, string> = {
  order: '顺序',
  loop: '列表循环',
  single: '单曲循环',
  shuffle: '随机',
  personalized: '个性化',
}

export type PlayerState = {
  readonly queue: readonly ApiSong[]
  readonly currentIndex: number
  readonly playing: boolean
  readonly currentTimeSec: number
  readonly durationSec: number
  readonly volume: number
  readonly muted: boolean
  readonly mode: PlayMode
  readonly lrcLines: readonly LrcLine[]
  readonly lrcLoading: boolean
  readonly audioUrl: string | undefined
  readonly audioLoading: boolean
  readonly error: string | undefined
}

export const INITIAL_STATE: PlayerState = {
  queue: [],
  currentIndex: -1,
  playing: false,
  currentTimeSec: 0,
  durationSec: 0,
  volume: 0.04, // 默认极轻 — 用户原话:"默认 100 音量震聋了,4 就行"
  muted: false,
  mode: 'order',
  lrcLines: [],
  lrcLoading: false,
  audioUrl: undefined,
  audioLoading: false,
  error: undefined,
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
