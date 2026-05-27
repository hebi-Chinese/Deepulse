/* eslint-disable @typescript-eslint/require-await -- better-sqlite3 is sync */
// NcmSnapshotRepo · 存 NCM cold start 拉的用户画像
// 单条记录 (id=1) 覆盖更新

import { ValidationError } from '@claudio/shared'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { ncmAccount, ncmSnapshot } from '../schema.js'

import type { DbClient } from '../client.js'
import type { INcmSnapshotRepo, NcmUserSnapshot } from '@claudio/application'

// 边界校验: DB 里的 JSON 反序列化时,至少保证顶层 shape + 关键嵌套字段合法
// 完整 schema 等 v1.5 (应用层把 NcmUserSnapshot 拆 zod 后再共享)
const playlistMetaShape = z.object({
  id: z.string(),
  name: z.string(),
  songCount: z.number(),
  isCreated: z.boolean(),
  coverUrl: z.string().optional(),
})
const songShape = z.object({
  id: z.string(),
  title: z.string(),
  artists: z.array(z.object({ id: z.string(), name: z.string() })),
})
const recentPlayShape = z.object({ songId: z.string(), playCount: z.number() })
const snapshotShapeSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  vipType: z.number(),
  level: z.number(),
  likedSongIds: z.array(z.string()),
  playlists: z.array(playlistMetaShape),
  dailyRecommendations: z.array(songShape.passthrough()),
  heartMode: z.array(songShape.passthrough()),
  stylePreferences: z.array(z.string()),
  recentPlayed: z.array(recentPlayShape),
  fmTrashSongIds: z.array(z.string()),
  snapshotAtMs: z.number(),
})

function parseSnapshot(raw: string): NcmUserSnapshot {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new ValidationError('ncm_snapshot.raw_json is not JSON', { cause: err })
  }
  const validated = snapshotShapeSchema.safeParse(parsed)
  if (!validated.success) {
    throw new ValidationError(`ncm_snapshot shape invalid: ${validated.error.message}`)
  }
  // TODO(2026-05-26): 把 NcmUserSnapshot 在 application 层改为 zod 单一真相源后,
  // 这里能 z.infer 出完整类型,去掉这个 cast (Standards §1.3 知情豁免)
  // 当前: 顶层 shape 已校验,内嵌 playlists/songs/recentPlayed 等由写入方 NcmClient 保证
  return parsed as NcmUserSnapshot
}

export function createNcmSnapshotRepo(client: DbClient): INcmSnapshotRepo {
  return {
    async save(snapshot: NcmUserSnapshot): Promise<void> {
      const rawJson = JSON.stringify(snapshot)
      client.db.transaction((tx) => {
        tx.insert(ncmSnapshot)
          .values({ id: 1, snapshotAtMs: snapshot.snapshotAtMs, rawJson })
          .onConflictDoUpdate({
            target: ncmSnapshot.id,
            set: { snapshotAtMs: snapshot.snapshotAtMs, rawJson },
          })
          .run()

        // 同步更新 ncm_account 元信息
        tx.insert(ncmAccount)
          .values({
            id: 1,
            userId: snapshot.userId,
            userName: snapshot.userName,
            vipType: snapshot.vipType,
            level: snapshot.level,
            lastSnapshotAtMs: snapshot.snapshotAtMs,
          })
          .onConflictDoUpdate({
            target: ncmAccount.id,
            set: {
              userId: snapshot.userId,
              userName: snapshot.userName,
              vipType: snapshot.vipType,
              level: snapshot.level,
              lastSnapshotAtMs: snapshot.snapshotAtMs,
            },
          })
          .run()
      })
    },

    async load(): Promise<NcmUserSnapshot | null> {
      const rows = client.db.select().from(ncmSnapshot).where(eq(ncmSnapshot.id, 1)).all()
      const row = rows[0]
      if (row === undefined) return null
      return parseSnapshot(row.rawJson)
    },

    async status(): Promise<{ exists: boolean; lastSnapshotAtMs: number | null }> {
      const rows = client.db.select().from(ncmSnapshot).where(eq(ncmSnapshot.id, 1)).all()
      const row = rows[0]
      if (row === undefined) return { exists: false, lastSnapshotAtMs: null }
      return { exists: true, lastSnapshotAtMs: row.snapshotAtMs }
    },
  }
}
