// SystemClock · 默认 IClock 实现, 直接走 Date.now()
// 测试时换 FakeClock (fixed nowMs 或可调步进) — 不在这层关心

import type { IClock } from '@deepulse/application'

export function createSystemClock(): IClock {
  return {
    nowMs: () => Date.now(),
  }
}
