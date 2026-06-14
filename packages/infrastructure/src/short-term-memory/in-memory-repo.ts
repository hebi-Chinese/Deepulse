/* eslint-disable @typescript-eslint/require-await -- IShortTermMemoryRepo port 是 async, 内存版同步实现也得 wrap Promise */
// 内存版短期记忆 — 无 Redis 时的 fallback (dev / fork 者首次跑)
// 单进程内存, 不跨服务. session TTL 走 setTimeout
// IClock 注入让测试可控时间

import type { IClock, IShortTermMemoryRepo, SessionTurn } from '@deepulse/application'

export type InMemoryShortTermConfig = {
  readonly idleTtlMs: number
  readonly clock: IClock
}

export function createInMemoryShortTermRepo(cfg: InMemoryShortTermConfig): IShortTermMemoryRepo {
  const turns: SessionTurn[] = []
  // 上次活动时间, 跟 nowMs 比 idleTtlMs 判 active
  // 不用 setTimeout (那个跨重启会丢, 也跟实际"现在时间"耦合)
  let lastActiveAtMs: number | null = null

  return {
    appendTurn: async (turn) => {
      turns.push(turn)
      lastActiveAtMs = cfg.clock.nowMs()
    },
    loadCurrentSession: async () => {
      if (!isActive(lastActiveAtMs, cfg)) return []
      return [...turns]
    },
    isSessionActive: async () => isActive(lastActiveAtMs, cfg),
    clearSession: async () => {
      turns.length = 0
      lastActiveAtMs = null
    },
    endSession: async () => {
      // 立即过期 — 下次 isSessionActive 返 false 但 turns 还在 (给 distill 用)
      lastActiveAtMs = null
    },
  }
}

function isActive(lastMs: number | null, cfg: InMemoryShortTermConfig): boolean {
  if (lastMs === null) return false
  return cfg.clock.nowMs() - lastMs < cfg.idleTtlMs
}
