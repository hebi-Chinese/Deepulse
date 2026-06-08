// playerStorage · queue / mode / volume 持久化到 localStorage
// 不持久化 playing / currentTimeSec / audioUrl / lrcLines / error
// currentIndex 刷新后重置为 -1,避免一开页就触发 fetch URL + 自动播放 (autoplay 也会被拦)

import { z } from 'zod'

import { INITIAL_STATE, type PlayerState } from './types'

const STORAGE_KEY = 'claudio.player.v1'

const apiArtistSchema = z.object({ id: z.string(), name: z.string() })
const apiAlbumSchema = z.object({ id: z.string(), name: z.string() })
const apiSongSchema = z.object({
  id: z.string(),
  ncmId: z.string(),
  title: z.string(),
  artists: z.array(apiArtistSchema),
  album: apiAlbumSchema.optional(),
  durationMs: z.number(),
  coverUrl: z.string().optional(),
})
const persistedSchema = z.object({
  queue: z.array(apiSongSchema),
  mode: z.enum(['order', 'loop', 'single', 'shuffle']),
  volume: z.number().min(0).max(1),
  muted: z.boolean(),
})

type Persisted = z.infer<typeof persistedSchema>

export function loadInitialState(): PlayerState {
  if (typeof window === 'undefined') return INITIAL_STATE
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) return INITIAL_STATE
  try {
    const parsed: unknown = JSON.parse(raw)
    const data = persistedSchema.parse(parsed)
    return {
      ...INITIAL_STATE,
      queue: data.queue,
      mode: data.mode,
      volume: data.volume,
      muted: data.muted,
      // currentIndex 故意不恢复 — 刷新后不该自动播
    }
  } catch {
    // schema 不对 (旧版数据) → 清掉,回退默认
    window.localStorage.removeItem(STORAGE_KEY)
    return INITIAL_STATE
  }
}

export type PersistFields = Pick<PlayerState, 'queue' | 'mode' | 'volume' | 'muted'>

export function persist(fields: PersistFields): void {
  if (typeof window === 'undefined') return
  // 过滤掉本地导入歌 (localUrl 是 blob URL,刷新即失效)
  const cleanQueue = fields.queue.filter((s) => s.localUrl === undefined)
  const data: Persisted = {
    queue: cleanQueue,
    mode: fields.mode,
    volume: fields.volume,
    muted: fields.muted,
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err: unknown) {
    // QuotaExceeded / 隐私模式禁写 — 写不进就算了 (持久化不是核心功能)
    // 但留痕, 否则用户重启后队列没了完全摸不到原因
    console.warn('[playerStorage] persist failed (quota/private-mode?):', err)
  }
}
