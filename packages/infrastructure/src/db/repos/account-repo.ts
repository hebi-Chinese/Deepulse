/* eslint-disable @typescript-eslint/require-await -- better-sqlite3 is sync */
// AccountRepo · ncm_account 持久 cookie 等元信息
// 接口在 application/ports/repos.ts (Clean Arch: infra 实现 application 定义的 port)

import { eq } from 'drizzle-orm'

import { ncmAccount } from '../schema.js'

import type { DbClient } from '../client.js'
import type { INcmAccountRepo } from '@claudio/application'

export function createNcmAccountRepo(client: DbClient): INcmAccountRepo {
  return {
    async saveCookie(cookie: string): Promise<void> {
      // INSERT 和 UPDATE 分支必须同一个时间戳, 否则两路径写入不同 loggedInAtMs
      const nowMs = Date.now()
      client.db
        .insert(ncmAccount)
        .values({ id: 1, cookie, loggedInAtMs: nowMs })
        .onConflictDoUpdate({
          target: ncmAccount.id,
          set: { cookie, loggedInAtMs: nowMs },
        })
        .run()
    },

    async loadCookie(): Promise<string | null> {
      const rows = client.db.select().from(ncmAccount).where(eq(ncmAccount.id, 1)).all()
      return rows[0]?.cookie ?? null
    },

    async clear(): Promise<void> {
      client.db.delete(ncmAccount).where(eq(ncmAccount.id, 1)).run()
    },
  }
}
