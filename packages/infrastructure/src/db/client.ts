// 数据库客户端 · better-sqlite3 + drizzle
// 同步 API（单用户场景反而更简单）
//
// migrations 路径 infra 自己 own — composition root 不需要知道源码布局
// (architect HIGH-4 fix: 之前 composition.ts 写死了 '../../../packages/infrastructure/src/db/migrations'
// 这个 fallback 在 prod build 必坏)

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import { schema } from './schema.js'

export type DbClient = ReturnType<typeof createDb>

// migrations 文件夹 = 本源文件所在 dir → 上溯一层 → migrations/
// (db/client.ts → db/ → db/migrations/)
const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLED_MIGRATIONS_DIR = resolve(HERE, 'migrations')

export function createDb(dbUrl: string): {
  db: ReturnType<typeof drizzle<typeof schema>>
  close: () => void
  /** 用 infra 自带的 bundled migrations dir; 用户想自定义可显式传 */
  applyMigrations: (migrationsFolder?: string) => void
} {
  // 确保目录存在
  const dir = dirname(dbUrl)
  if (dir.length > 0 && dir !== '.') {
    mkdirSync(dir, { recursive: true })
  }

  const sqlite = new BetterSqlite3(dbUrl)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  return {
    db,
    close: () => sqlite.close(),
    applyMigrations: (migrationsFolder) => {
      migrate(db, { migrationsFolder: migrationsFolder ?? BUNDLED_MIGRATIONS_DIR })
    },
  }
}
