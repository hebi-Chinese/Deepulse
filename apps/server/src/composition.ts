// 依赖装配中心 · 手写工厂模式（不引 DI 容器框架）
// 在这里把 ports 和具体 adapter 绑定；换实现 = 改这里一处

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createBrain } from '@deepulse/infrastructure/brain'
import { createSystemClock } from '@deepulse/infrastructure/clock'
// 注: migration path 不再在这里写死, 默认 createDb 用 infra bundled migrations
//    composition root 只在用户显式传 env.MIGRATIONS_DIR 时覆盖
import {
  createConversationsRepo,
  createDb,
  createNcmAccountRepo,
  createNcmSnapshotRepo,
  createPlaysRepo,
  createSongRepo,
  type DbClient,
} from '@deepulse/infrastructure/db'
import { createFilesystemLongTermRepo } from '@deepulse/infrastructure/long-term-memory'
import { NcmClient } from '@deepulse/infrastructure/ncm'
import { createShortTermMemoryRepo } from '@deepulse/infrastructure/short-term-memory'
import { createTts } from '@deepulse/infrastructure/tts'
import { createFilesystemUserPrefsRepo } from '@deepulse/infrastructure/user-prefs'

import type {
  IBrain,
  IClock,
  IConversationsRepo,
  ILongTermMemoryRepo,
  INcmAccountRepo,
  INcmClient,
  INcmSnapshotRepo,
  IPlaysRepo,
  IShortTermMemoryRepo,
  ISongRepo,
  ITtsClient,
  IUserPrefsRepo,
} from '@deepulse/application'
import type { Env } from '@deepulse/shared'

export type Container = {
  readonly env: Env
  readonly brain: IBrain
  readonly tts: ITtsClient
  readonly ncm: INcmClient
  readonly db: DbClient
  readonly clock: IClock
  readonly songs: ISongRepo
  readonly plays: IPlaysRepo
  readonly snapshot: INcmSnapshotRepo
  readonly account: INcmAccountRepo
  readonly conversations: IConversationsRepo
  readonly userPrefs: IUserPrefsRepo
  readonly shortTerm: IShortTermMemoryRepo
  readonly longTerm: ILongTermMemoryRepo
}

// migrations 路径解析:
// 1) env.MIGRATIONS_DIR 显式指定 (prod build 必须给,否则 dist 下相对路径会跑偏)
// 2) fallback 走 dev 时源码相对路径 (apps/server/src → packages/infrastructure/src/db/migrations)
const currentDir = dirname(fileURLToPath(import.meta.url))
// user-prefs markdown 文件目录 (apps/server/data/user-prefs)
// 路径相对源文件解析, 不靠 process.cwd() — 不同进程管理器 cwd 可能不一致
const USER_PREFS_DIR = resolve(currentDir, '..', 'data', 'user-prefs')

// 长期记忆 distill markdown 文件 (apps/server/data/dj-long-term.md)
const LONG_TERM_PATH = resolve(currentDir, '..', 'data', 'dj-long-term.md')

export function buildContainer(env: Env): Container {
  const dbClient = createDb(env.DATABASE_URL)
  // 用户显式给了 MIGRATIONS_DIR 才覆盖, 否则用 createDb 自带的 bundled 路径
  dbClient.applyMigrations(env.MIGRATIONS_DIR)

  const accountRepo = createNcmAccountRepo(dbClient)
  // clock 先建 — NcmClient ctor 要它
  const clock = createSystemClock()

  return {
    env,
    brain: createBrain(env.BRAIN_TYPE, {
      aiUrl: env.AI_URL,
      aiKey: env.AI_KEY,
      aiModel: env.AI_MODEL,
    }),
    tts: createTts(env.TTS_TYPE, {
      ttsUrl: env.TTS_URL,
      voxcpmUrl: env.VOXCPM_URL,
      voxcpmVoiceDesign: env.VOXCPM_VOICE_DESIGN,
    }),
    // cookie 优先级：DB 持久化 > env > undefined（启动后 cold-start 会再尝试加载）
    ncm: new NcmClient(env.NCM_COOKIE, clock),
    db: dbClient,
    clock,
    songs: createSongRepo(dbClient),
    plays: createPlaysRepo(dbClient),
    snapshot: createNcmSnapshotRepo(dbClient),
    account: accountRepo,
    conversations: createConversationsRepo(dbClient),
    userPrefs: createFilesystemUserPrefsRepo({
      dataDir: env.USER_PREFS_DIR ?? USER_PREFS_DIR,
    }),
    shortTerm: createShortTermMemoryRepo({
      redisUrl: env.REDIS_URL,
      idleTtlMs: env.SESSION_IDLE_MS,
      clock,
      log: (msg, err) => {
        // composition root 还没 logger, 临时打 stderr 让 Redis 连接问题别静默
        // (server 起来后 fastify pino 会接, 这只是 ctor 那一下)
        process.stderr.write(`[short-term-memory] ${msg}: ${String(err)}\n`)
      },
    }),
    longTerm: createFilesystemLongTermRepo({
      filePath: env.LONG_TERM_PATH ?? LONG_TERM_PATH,
    }),
  }
}
