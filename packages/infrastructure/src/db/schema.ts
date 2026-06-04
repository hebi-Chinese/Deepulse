// Drizzle schema · SQLite · 单一真相源
// 类型从 schema 推导 (typeof xxx.$inferSelect), 不手写
// 改 schema：drizzle-kit generate → migrate

import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// ── songs · NCM 歌曲缓存（避免反复查 NCM 拿元数据）──
export const songs = sqliteTable('songs', {
  id: text('id').primaryKey(), // = ncmId（branded SongId）
  ncmId: text('ncm_id').notNull(),
  title: text('title').notNull(),
  // JSON 序列化的 artists 数组 [{id,name}]
  artistsJson: text('artists_json').notNull(),
  albumId: text('album_id'),
  albumName: text('album_name'),
  coverUrl: text('cover_url'),
  durationMs: integer('duration_ms').notNull(),
  createdAtMs: integer('created_at_ms')
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

// ── plays · 听歌历史 ──
export const plays = sqliteTable('plays', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  songId: text('song_id').notNull(),
  playedAtMs: integer('played_at_ms').notNull(),
  finished: integer('finished', { mode: 'boolean' }).notNull(),
  source: text('source', { enum: ['plan', 'fm', 'manual', 'recommendation', 'search'] }).notNull(),
  mood: text('mood'),
  energy: integer('energy'),
})

// ── bubbles · DJ 串场记录 ──
export const bubbles = sqliteTable('bubbles', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['say', 'segue', 'reaction', 'greeting'] }).notNull(),
  text: text('text').notNull(),
  audioUrl: text('audio_url'),
  createdAtMs: integer('created_at_ms').notNull(),
  playedAtMs: integer('played_at_ms'),
})

// ── plan · 今日节目单 ──
export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  dateIso: text('date_iso').notNull(), // 'YYYY-MM-DD'
  createdAtMs: integer('created_at_ms').notNull(),
})

export const planItems = sqliteTable('plan_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  planId: text('plan_id').notNull(),
  slotAtMs: integer('slot_at_ms').notNull(),
  songId: text('song_id').notNull(),
  reason: text('reason').notNull(),
  status: text('status', { enum: ['queued', 'playing', 'played', 'skipped'] })
    .notNull()
    .default('queued'),
  orderIdx: integer('order_idx').notNull(),
})

// ── prefs · key/value JSON 存配置（用户偏好、最近播放队列等）──
export const prefs = sqliteTable('prefs', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAtMs: integer('updated_at_ms')
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

// ── taste_snapshots · taste.md 演进快照 ──
export const tasteSnapshots = sqliteTable('taste_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  takenAtMs: integer('taken_at_ms').notNull(),
  content: text('content').notNull(), // markdown
  reason: text('reason'), // 为什么有这个 snapshot（"用户手编"/"NCM 同步"/"AI 学习"）
})

// ── conversations · 用户与 DJ 对话历史 ──
export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tsMs: integer('ts_ms').notNull(),
  userMsg: text('user_msg').notNull(),
  djReply: text('dj_reply').notNull(),
  brainLatencyMs: integer('brain_latency_ms'),
  contextSize: integer('context_size'),
})

// ── ncm_account · 登录态 + 元信息 ──
export const ncmAccount = sqliteTable('ncm_account', {
  id: integer('id').primaryKey().default(1), // 单行表
  cookie: text('cookie'),
  userId: text('user_id'),
  userName: text('user_name'),
  vipType: integer('vip_type').notNull().default(0),
  level: integer('level').notNull().default(0),
  loggedInAtMs: integer('logged_in_at_ms'),
  lastSnapshotAtMs: integer('last_snapshot_at_ms'),
})

// ── ncm_snapshot · cold start 拉的用户画像快照 ──
// 单条记录（每次刷新覆盖 id=1）
export const ncmSnapshot = sqliteTable('ncm_snapshot', {
  id: integer('id').primaryKey().default(1),
  snapshotAtMs: integer('snapshot_at_ms').notNull(),
  rawJson: text('raw_json').notNull(), // 完整 NcmUserSnapshot 的 JSON
})

// 推导类型
export type DbSong = typeof songs.$inferSelect
export type DbSongInsert = typeof songs.$inferInsert
export type DbPlay = typeof plays.$inferSelect
export type DbPlayInsert = typeof plays.$inferInsert
export type DbBubble = typeof bubbles.$inferSelect
export type DbPlan = typeof plans.$inferSelect
export type DbPlanItem = typeof planItems.$inferSelect
export type DbPrefRow = typeof prefs.$inferSelect
export type DbTasteSnapshot = typeof tasteSnapshots.$inferSelect
export type DbConversation = typeof conversations.$inferSelect
export type DbNcmAccount = typeof ncmAccount.$inferSelect
export type DbNcmSnapshot = typeof ncmSnapshot.$inferSelect

export const schema = {
  songs,
  plays,
  bubbles,
  plans,
  planItems,
  prefs,
  tasteSnapshots,
  conversations,
  ncmAccount,
  ncmSnapshot,
}
