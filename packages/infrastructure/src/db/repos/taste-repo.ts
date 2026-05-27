/* eslint-disable @typescript-eslint/require-await -- better-sqlite3 is sync */
// TasteRepo · taste snapshots（含 markdown 内容）
// 接口 + TasteSnapshotEntry 在 application/ports/repos.ts

import { desc, eq } from 'drizzle-orm'

import { tasteSnapshots, type DbTasteSnapshot } from '../schema.js'

import type { DbClient } from '../client.js'
import type { ITasteRepo, TasteSnapshotEntry } from '@claudio/application'

function dbRowToEntry(row: DbTasteSnapshot): TasteSnapshotEntry {
  const base = { id: row.id, takenAtMs: row.takenAtMs, content: row.content }
  return row.reason !== null ? { ...base, reason: row.reason } : base
}

export function createTasteRepo(client: DbClient): ITasteRepo {
  return {
    async append(content, reason): Promise<number> {
      const result = client.db
        .insert(tasteSnapshots)
        .values({ takenAtMs: Date.now(), content, reason: reason ?? null })
        .returning({ id: tasteSnapshots.id })
        .all()
      return result[0]?.id ?? 0
    },

    async latest(): Promise<TasteSnapshotEntry | null> {
      const rows = client.db
        .select()
        .from(tasteSnapshots)
        .orderBy(desc(tasteSnapshots.takenAtMs))
        .limit(1)
        .all()
      const row = rows[0]
      return row !== undefined ? dbRowToEntry(row) : null
    },

    async list(limit): Promise<readonly TasteSnapshotEntry[]> {
      const rows = client.db
        .select()
        .from(tasteSnapshots)
        .orderBy(desc(tasteSnapshots.takenAtMs))
        .limit(limit)
        .all()
      return rows.map(dbRowToEntry)
    },

    async byId(id): Promise<TasteSnapshotEntry | null> {
      const rows = client.db.select().from(tasteSnapshots).where(eq(tasteSnapshots.id, id)).all()
      const row = rows[0]
      return row !== undefined ? dbRowToEntry(row) : null
    },
  }
}
