// 短期记忆工厂 — 用户配 REDIS_URL 走 Redis, 否则 in-memory fallback
//
// 注意: Redis 连接失败时不抛 — 静默退回 in-memory (dev / fork 者首次跑无 Redis 也能跑)
// 真线上想强校验, 在 composition root 自行检查

import { Redis } from 'ioredis'

import { createInMemoryShortTermRepo } from './in-memory-repo.js'
import { createRedisShortTermRepo } from './redis-repo.js'

import type { IClock, IShortTermMemoryRepo } from '@deepulse/application'

export type ShortTermMemoryConfig = {
  /** Redis 连接串 (e.g. "redis://localhost:6379"); undefined → in-memory */
  readonly redisUrl: string | undefined
  /** session idle TTL; 用户没说话超过这个时间 → 新 session */
  readonly idleTtlMs: number
  /** 内存版要用; Redis 版自己用服务端 TTL, 这里也保留给 metadata 用 */
  readonly clock: IClock
  /** 日志, Redis 连接失败时 warn */
  readonly log?: (msg: string, err?: unknown) => void
}

export function createShortTermMemoryRepo(cfg: ShortTermMemoryConfig): IShortTermMemoryRepo {
  if (cfg.redisUrl === undefined) {
    return createInMemoryShortTermRepo({ idleTtlMs: cfg.idleTtlMs, clock: cfg.clock })
  }
  try {
    // lazyConnect: true 让 ctor 不立刻连, 防 composition root 启动卡住
    // maxRetriesPerRequest=2 防一次请求慢导致 fastify handler 永远 await
    const redis = new Redis(cfg.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 })
    redis.on('error', (err: unknown) => {
      cfg.log?.('redis short-term repo connection error', err)
    })
    void redis.connect().catch((err: unknown) => {
      cfg.log?.('redis short-term repo connect failed (will keep retrying)', err)
    })
    return createRedisShortTermRepo({ redis, idleTtlMs: cfg.idleTtlMs })
  } catch (err: unknown) {
    cfg.log?.('redis short-term ctor threw, falling back to in-memory', err)
    return createInMemoryShortTermRepo({ idleTtlMs: cfg.idleTtlMs, clock: cfg.clock })
  }
}

export { createInMemoryShortTermRepo } from './in-memory-repo.js'
export { createRedisShortTermRepo } from './redis-repo.js'
