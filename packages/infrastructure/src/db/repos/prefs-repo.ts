/* eslint-disable @typescript-eslint/require-await -- better-sqlite3 is sync */
// PrefsRepo · key/value JSON 偏好存储

import { ValidationError } from '@claudio/shared'
import { eq } from 'drizzle-orm'

import { prefs } from '../schema.js'

import type { DbClient } from '../client.js'
import type { IPrefsRepo } from '@claudio/application'
import type { z } from 'zod'

export function createPrefsRepo(client: DbClient): IPrefsRepo {
  return {
    async get<T>(key: string, schema: z.ZodSchema<T>): Promise<T | null> {
      const rows = client.db.select().from(prefs).where(eq(prefs.key, key)).all()
      const row = rows[0]
      if (row === undefined) return null
      // JSON.parse 失败 = 行损坏,抛 ValidationError 让调用方决定 (清掉行 / 报错 / 兜底)
      // 不能 silent return null — 那样调用方区分不出 "key 不存在" 和 "key 损坏"
      let raw: unknown
      try {
        raw = JSON.parse(row.valueJson)
      } catch (err: unknown) {
        throw new ValidationError(
          `prefs[${key}] valueJson is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      const parsed = schema.safeParse(raw)
      if (!parsed.success) {
        throw new ValidationError(
          `prefs[${key}] schema mismatch (migration needed?): ${parsed.error.message}`,
        )
      }
      return parsed.data
    },

    async set<T>(key: string, value: T, schema: z.ZodSchema<T>): Promise<void> {
      // 写入前校验
      schema.parse(value)
      const valueJson = JSON.stringify(value)
      client.db
        .insert(prefs)
        .values({ key, valueJson })
        .onConflictDoUpdate({
          target: prefs.key,
          set: { valueJson, updatedAtMs: Date.now() },
        })
        .run()
    },
  }
}
