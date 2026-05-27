// 仓储接口 · 实现：infrastructure/db/ (drizzle)
// 业务用例只依赖这些接口，不知道底层是 SQLite 还是别的
// Clean Arch: 接口必须在 application 层,不能让 infra 反向声明接口让 application 依赖

import type { NcmUserSnapshot } from './ncm.js'
import type { Bubble, Plan, PlanId, Song, SongId } from '@claudio/domain'
import type { z } from 'zod'

export type PlaySource = 'plan' | 'fm' | 'manual' | 'recommendation' | 'search'

export type PlayRecord = {
  readonly songId: SongId
  readonly playedAtMs: number
  readonly finished: boolean
  readonly source: PlaySource
}

export type ISongRepo = {
  findById(id: SongId): Promise<Song | null>
  upsert(song: Song): Promise<void>
}

export type IPlaysRepo = {
  recordPlay(play: PlayRecord): Promise<void>
  recentPlays(limit: number): Promise<readonly PlayRecord[]>
  countPlays(songId: SongId, sinceMs: number): Promise<number>
}

export type IBubblesRepo = {
  save(bubble: Bubble): Promise<void>
  recent(limit: number): Promise<readonly Bubble[]>
}

export type IPlanRepo = {
  findByDate(dateIso: string): Promise<Plan | null>
  save(plan: Plan): Promise<void>
  markStatus(planId: PlanId, slotAtMs: number, status: 'played' | 'skipped'): Promise<void>
}

export type IPrefsRepo = {
  /** 用 zod schema 校验+类型推断 */
  get<T>(key: string, schema: z.ZodSchema<T>): Promise<T | null>
  set<T>(key: string, value: T, schema: z.ZodSchema<T>): Promise<void>
}

// ── NCM 用户账号 cookie 持久化 ──
export type INcmAccountRepo = {
  saveCookie(cookie: string): Promise<void>
  loadCookie(): Promise<string | null>
  clear(): Promise<void>
}

// ── NCM 用户画像 snapshot 持久化 (cold-start 拉一次,后续读 DB) ──
export type INcmSnapshotRepo = {
  save(snapshot: NcmUserSnapshot): Promise<void>
  load(): Promise<NcmUserSnapshot | null>
  /** 仅返回元信息：是否有快照 + 最后拉取时间 */
  status(): Promise<{ exists: boolean; lastSnapshotAtMs: number | null }>
}

// ── DJ 对话历史 ──
export type ConversationEntry = {
  readonly tsMs: number
  readonly userMsg: string
  readonly djReply: string
  readonly brainLatencyMs?: number
  readonly contextSize?: number
}

export type IConversationsRepo = {
  append(entry: ConversationEntry): Promise<void>
  recent(limit: number): Promise<readonly ConversationEntry[]>
}

// ── Taste snapshot (markdown 内容) ──
export type TasteSnapshotEntry = {
  readonly id: number
  readonly takenAtMs: number
  readonly content: string
  readonly reason?: string
}

export type ITasteRepo = {
  append(content: string, reason?: string): Promise<number>
  latest(): Promise<TasteSnapshotEntry | null>
  list(limit: number): Promise<readonly TasteSnapshotEntry[]>
  byId(id: number): Promise<TasteSnapshotEntry | null>
}
