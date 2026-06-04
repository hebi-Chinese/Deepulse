// 依赖装配中心 · 手写工厂模式（不引 DI 容器框架）
// 在这里把 ports 和具体 adapter 绑定；换实现 = 改这里一处

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createBrain } from '@claudio/infrastructure/brain'
// 注: migration path 不再在这里写死, 默认 createDb 用 infra bundled migrations
//    composition root 只在主人显式传 env.MIGRATIONS_DIR 时覆盖
import { createCalendar } from '@claudio/infrastructure/calendar'
import { createSystemClock } from '@claudio/infrastructure/clock'
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
import { createTts } from '@claudio/infrastructure/tts'
import { createFilesystemUserPrefsRepo } from '@claudio/infrastructure/user-prefs'

import type {
  IBrain,
  IBubblesRepo,
  ICalendarSource,
  IClock,
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
  IUserPrefsRepo,
} from '@claudio/application'
import type { Env } from '@claudio/shared'

export type Container = {
  readonly env: Env
  readonly brain: IBrain
  readonly tts: ITtsClient
  readonly calendar: ICalendarSource
  readonly ncm: INcmClient
  readonly db: DbClient
  readonly clock: IClock
  readonly songs: ISongRepo
  readonly plays: IPlaysRepo
  readonly bubbles: IBubblesRepo
  readonly plan: IPlanRepo
  readonly prefs: IPrefsRepo
  readonly snapshot: INcmSnapshotRepo
  readonly account: INcmAccountRepo
  readonly conversations: IConversationsRepo
  readonly taste: ITasteRepo
  readonly userPrefs: IUserPrefsRepo
}

// migrations 路径解析:
// 1) env.MIGRATIONS_DIR 显式指定 (prod build 必须给,否则 dist 下相对路径会跑偏)
// 2) fallback 走 dev 时源码相对路径 (apps/server/src → packages/infrastructure/src/db/migrations)
const currentDir = dirname(fileURLToPath(import.meta.url))
// user-prefs markdown 文件目录 (apps/server/data/user-prefs)
// 路径相对源文件解析, 不靠 process.cwd() — 不同进程管理器 cwd 可能不一致
const USER_PREFS_DIR = resolve(currentDir, '..', 'data', 'user-prefs')

export function buildContainer(env: Env): Container {
  const dbClient = createDb(env.DATABASE_URL)
  // 主人显式给了 MIGRATIONS_DIR 才覆盖, 否则用 createDb 自带的 bundled 路径
  dbClient.applyMigrations(env.MIGRATIONS_DIR)

  const accountRepo = createNcmAccountRepo(dbClient)

  return {
    env,
    brain: createBrain(env.BRAIN_TYPE, {
      openaiBaseUrl: env.OPENAI_BASE_URL,
      openaiApiKey: env.OPENAI_API_KEY,
      openaiModel: env.OPENAI_MODEL,
    }),
    tts: createTts(env.TTS_TYPE, { ttsUrl: env.TTS_URL }),
    calendar: createCalendar('noop'),
    // cookie 优先级：DB 持久化 > env > undefined（启动后 cold-start 会再尝试加载）
    ncm: new NcmClient(env.NCM_COOKIE),
    db: dbClient,
    clock: createSystemClock(),
    songs: createSongRepo(dbClient),
    plays: createPlaysRepo(dbClient),
    bubbles: createBubblesRepo(dbClient),
    plan: createPlanRepo(dbClient),
    prefs: createPrefsRepo(dbClient),
    snapshot: createNcmSnapshotRepo(dbClient),
    account: accountRepo,
    conversations: createConversationsRepo(dbClient),
    taste: createTasteRepo(dbClient),
    userPrefs: createFilesystemUserPrefsRepo({
      dataDir: env.USER_PREFS_DIR ?? USER_PREFS_DIR,
    }),
  }
}
