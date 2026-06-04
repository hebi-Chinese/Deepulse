// Cold start · 启动时把 DB 持久化的 cookie 装回 NCM client，
// 如果 snapshot 缺或太老则尝试拉新的

import type { Container } from './composition.js'
import type { Logger } from '@claudio/shared'

const HOUR_MS = 60 * 60 * 1000
const SNAPSHOT_TTL_MS = 24 * HOUR_MS

export async function runColdStart(container: Container, logger: Logger): Promise<void> {
  // 1) DB 里的 cookie 优先于 env（用户手动登录会写 DB）
  // SECURITY: dbCookie 含 NCM 会话 token, **永远不要把它塞进 logger 调用**
  const dbCookie = await container.account.loadCookie()
  if (dbCookie !== null && dbCookie.length > 0) {
    container.ncm.setCookie(dbCookie)
    logger.info('cold-start: restored cookie from DB')
  }

  // 2) 没登录就不拉 snapshot
  if (container.ncm.getCookie() === undefined) {
    logger.info('cold-start: no cookie, skipping snapshot fetch')
    return
  }

  // 3) 看 DB 里有没有最近的 snapshot
  const status = await container.snapshot.status()
  if (status.exists && status.lastSnapshotAtMs !== null) {
    const ageMs = Date.now() - status.lastSnapshotAtMs
    const ageHours = Math.round(ageMs / HOUR_MS)
    if (ageMs < SNAPSHOT_TTL_MS) {
      logger.info({ ageHours }, 'cold-start: snapshot fresh, skip')
      return
    }
    logger.info({ ageHours }, 'cold-start: snapshot stale, refreshing')
  } else {
    logger.info('cold-start: no snapshot yet, fetching first time')
  }

  // 4) 拉新的（失败不阻塞启动）
  try {
    const snap = await container.ncm.fetchUserSnapshot()
    await container.snapshot.save(snap)
    logger.info(
      {
        userId: snap.userId,
        userName: snap.userName,
        vipType: snap.vipType,
        liked: snap.likedSongIds.length,
        playlists: snap.playlists.length,
      },
      'cold-start: snapshot saved',
    )
  } catch (err) {
    logger.warn({ err }, 'cold-start: snapshot fetch failed (will retry on next start)')
  }
}
