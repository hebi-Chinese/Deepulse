/* eslint-disable @typescript-eslint/require-await -- better-sqlite3 is sync */
// PlaysRepo · 听歌历史

import { toSongId } from '@deepulse/domain'
import { and, count, desc, eq, gte } from 'drizzle-orm'

import { plays } from '../schema.js'

import type { DbClient } from '../client.js'
import type { IPlaysRepo, PlayRecord } from '@deepulse/application'
import type { SongId } from '@deepulse/domain'

export function createPlaysRepo(client: DbClient): IPlaysRepo {
  return {
    async recordPlay(play: PlayRecord): Promise<void> {
      client.db
        .insert(plays)
        .values({
          songId: play.songId,
          playedAtMs: play.playedAtMs,
          finished: play.finished,
          source: play.source,
        })
        .run()
    },

    async recentPlays(limit: number): Promise<readonly PlayRecord[]> {
      const rows = client.db.select().from(plays).orderBy(desc(plays.playedAtMs)).limit(limit).all()
      return rows.map((r) => ({
        songId: toSongId(r.songId),
        playedAtMs: r.playedAtMs,
        finished: r.finished,
        source: r.source,
      }))
    },

    async countPlays(songId: SongId, sinceMs: number): Promise<number> {
      const rows = client.db
        .select({ c: count() })
        .from(plays)
        .where(and(eq(plays.songId, songId), gte(plays.playedAtMs, sinceMs)))
        .all()
      return rows[0]?.c ?? 0
    },
  }
}
