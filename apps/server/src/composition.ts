// 依赖装配中心 · 手写工厂模式（不引 DI 容器框架）
// 在这里把 ports 和具体 adapter 绑定；换实现 = 改这里一处

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createBrain } from '@claudio/infrastructure/brain'
import { createCalendar } from '@claudio/infrastructure/calendar'
import {
  createBubblesRepo,
  createConversationsRepo,
  createDb,
  createNcmAccountRepo,
  createNcmSnapshotRepo,
  createPlanRepo,
  createPlaysRepo,
  createPrefsRepo,
  createSongRepo,
  createTasteRepo,
  type DbClient,
} from '@claudio/infrastructure/db'
import { NcmClient } from '@claudio/infrastructure/ncm'
import { GptSovitsTtsClient } from '@claudio/infrastructure/tts'

import type {
  IBrain,
  IBubblesRepo,
  ICalendarSource,
  IConversationsRepo,
  INcmAccountRepo,
  INcmClient,
  INcmSnapshotRepo,
  IPlanRepo,
  IPlaysRepo,
  IPrefsRepo,
  ISongRepo,
  ITasteRepo,
  ITtsClient,
} from '@claudio/application'
import type { Env } from '@claudio/shared'

export type Container = {
  readonly env: Env
  readonly brain: IBrain
  readonly tts: ITtsClient
  readonly calendar: ICalendarSource
  readonly ncm: INcmClient
  readonly db: DbClient
  readonly songs: ISongRepo
  readonly plays: IPlaysRepo
  readonly bubbles: IBubblesRepo
  readonly plan: IPlanRepo
  readonly prefs: IPrefsRepo
  readonly snapshot: INcmSnapshotRepo
  readonly account: INcmAccountRepo
  readonly conversations: IConversationsRepo
  readonly taste: ITasteRepo
}

// migrations 路径解析:
// 1) env.MIGRATIONS_DIR 显式指定 (prod build 必须给,否则 dist 下相对路径会跑偏)
// 2) fallback 走 dev 时源码相对路径 (apps/server/src → packages/infrastructure/src/db/migrations)
const currentDir = dirname(fileURLToPath(import.meta.url))
const DEFAULT_MIGRATIONS_DIR = resolve(
  currentDir,
  '../../../packages/infrastructure/src/db/migrations',
)

export function buildContainer(env: Env): Container {
  const dbClient = createDb(env.DATABASE_URL)
  dbClient.applyMigrations(env.MIGRATIONS_DIR ?? DEFAULT_MIGRATIONS_DIR)

  const accountRepo = createNcmAccountRepo(dbClient)

  return {
    env,
    brain: createBrain(env.BRAIN_TYPE),
    tts: new GptSovitsTtsClient(env.TTS_URL),
    calendar: createCalendar('noop'),
    // cookie 优先级：DB 持久化 > env > undefined（启动后 cold-start 会再尝试加载）
    ncm: new NcmClient(env.NCM_COOKIE),
    db: dbClient,
    songs: createSongRepo(dbClient),
    plays: createPlaysRepo(dbClient),
    bubbles: createBubblesRepo(dbClient),
    plan: createPlanRepo(dbClient),
    prefs: createPrefsRepo(dbClient),
    snapshot: createNcmSnapshotRepo(dbClient),
    account: accountRepo,
    conversations: createConversationsRepo(dbClient),
    taste: createTasteRepo(dbClient),
  }
}
