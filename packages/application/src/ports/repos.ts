// 仓储接口 · 实现：infrastructure/db/ (drizzle)
// 业务用例只依赖这些接口，不知道底层是 SQLite 还是别的
// Clean Arch: 接口必须在 application 层,不能让 infra 反向声明接口让 application 依赖

import type { NcmUserSnapshot } from './ncm.js'
import type { Song, SongId } from '@deepulse/domain'

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

// ── DJ 对话历史 (sqlite append-only 归档) ──
// shortTerm 接 prompt context 后, 这个表就只剩查询/分析用途, prompt 已不读
export type ConversationEntry = {
  readonly tsMs: number
  readonly userMsg: string
  readonly djReply: string
  readonly brainLatencyMs?: number
}

export type IConversationsRepo = {
  append(entry: ConversationEntry): Promise<void>
}

// ── 用户手写的喜好 (markdown 长/短期, DJ 推歌前读) ──
// 长期: 用户手写, 整段 markdown 返出
// 短期: 用户手写, 每行 `YYYY-MM-DD: 描述`, 实现负责过滤 TTL
// nowMs 由调用方注入, 让 repo 实现可单测时间相关分支
export type UserPrefs = {
  readonly longTerm: string
  readonly shortTerm: string
}

export type IUserPrefsRepo = {
  load(nowMs: number): Promise<UserPrefs>
}
