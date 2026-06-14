// Redis 版短期记忆 — 跨进程持久, TTL 走 Redis EXPIRE
//
// Key 设计 (单用户应用, 没分租户):
//   deepulse:mem:active     STRING  "1"     TTL = idle timeout (每次 appendTurn 重置)
//   deepulse:mem:session    LIST    JSON[]  no TTL (current session turns)
//
// 活跃判定: EXISTS deepulse:mem:active.
// session 边界: active key 过期 → isSessionActive=false, 但 session list 还在
// → 调用方 (use-case) 拉出来 distill → 清掉 list → 下次 appendTurn 起新 session.

import { ExternalServiceError } from '@deepulse/domain'
import { z } from 'zod'

import type { IShortTermMemoryRepo, SessionTurn } from '@deepulse/application'
import type { Redis } from 'ioredis'

const ACTIVE_KEY = 'deepulse:mem:active'
const SESSION_KEY = 'deepulse:mem:session'

// Redis 里 JSON.stringify 存的 SessionTurn 是 untrusted bytes — schema 漂移/外部写入会
// 静默把坏数据喂进 prompt. zod 校验抛 → 让 wrap 包成 ExternalServiceError 上层看到.
const sessionTurnSchema = z.object({
  tsMs: z.number(),
  userMsg: z.string(),
  djReply: z.string(),
}) satisfies z.ZodType<SessionTurn>

export type RedisShortTermConfig = {
  readonly redis: Redis
  readonly idleTtlMs: number
}

export function createRedisShortTermRepo(cfg: RedisShortTermConfig): IShortTermMemoryRepo {
  const idleTtlSec = Math.max(1, Math.floor(cfg.idleTtlMs / 1000))
  const wrap = redisErrorWrapper(cfg.redis)
  return {
    appendTurn: wrap('appendTurn', async (turn: SessionTurn) => {
      // SET active key (重置 TTL) + RPUSH session list, multi 顺序保证.
      // 必须 assertMultiExecOk — ioredis exec() 单 cmd 失败不抛, 静默吞 →
      // 调用方以为 turn 持久了实际没写
      const results = await cfg.redis
        .multi()
        .set(ACTIVE_KEY, '1', 'EX', idleTtlSec)
        .rpush(SESSION_KEY, JSON.stringify(turn))
        .exec()
      assertMultiExecOk('appendTurn', results)
    }),
    loadCurrentSession: wrap('loadCurrentSession', async () => {
      // EXISTS + LRANGE 必须原子 — 两次 round-trip 中间 TTL 可能过期,
      // 把过期 session 的 turn 当 active 喂回 prompt
      const results = await cfg.redis.multi().exists(ACTIVE_KEY).lrange(SESSION_KEY, 0, -1).exec()
      assertMultiExecOk('loadCurrentSession', results)
      // assertMultiExecOk 保 results 非 null + 各 cmd 没 err; 走到这能安全 narrow
      const ok = results as readonly (readonly [Error | null, unknown])[]
      // 形状: [[null, existsCount], [null, rangeArray]]
      const activeCount = ok[0]?.[1] as number | undefined
      if (activeCount === undefined || activeCount === 0) return []
      const raw = (ok[1]?.[1] ?? []) as readonly string[]
      return raw.map((s) => parseSessionTurn(s))
    }),
    isSessionActive: wrap('isSessionActive', async () => (await cfg.redis.exists(ACTIVE_KEY)) > 0),
    clearSession: wrap('clearSession', async () => {
      await cfg.redis.del(SESSION_KEY, ACTIVE_KEY)
    }),
    // endSession 只删 active, 保留 session list 给 distill 拉
    endSession: wrap('endSession', async () => {
      await cfg.redis.del(ACTIVE_KEY)
    }),
  }
}

function parseSessionTurn(raw: string): SessionTurn {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err: unknown) {
    throw new ExternalServiceError(
      'redis-short-term',
      `session entry not JSON: ${raw.slice(0, 80)}`,
      undefined,
      { cause: err },
    )
  }
  return sessionTurnSchema.parse(parsed)
}

// ioredis multi/exec 返回 [[Error|null, result], ...]; 任一 Error 非 null 都得抛
function assertMultiExecOk(
  op: string,
  results: readonly (readonly [Error | null, unknown])[] | null,
): void {
  if (results === null) {
    // exec 整体失败 (e.g. EXECABORT) — ioredis 通常会 reject Promise 但兜底一下
    throw new ExternalServiceError('redis-short-term', `${op}: multi/exec returned null`)
  }
  for (const [err, _val] of results) {
    if (err !== null) {
      throw new ExternalServiceError('redis-short-term', `${op}: cmd in multi failed`, undefined, {
        cause: err,
      })
    }
  }
}

// 统一抓 Redis 错误 + 包 ExternalServiceError 保留 cause
function redisErrorWrapper(
  _redis: Redis,
): <T extends unknown[], R>(
  op: string,
  fn: (...args: T) => Promise<R>,
) => (...args: T) => Promise<R> {
  return (op, fn) =>
    async (...args) => {
      try {
        return await fn(...args)
      } catch (err: unknown) {
        // 已经是 ExternalServiceError 直接抛, 不要再嵌一层 cause
        if (err instanceof ExternalServiceError) throw err
        throw new ExternalServiceError('redis-short-term', `${op} failed`, undefined, {
          cause: err,
        })
      }
    }
}
