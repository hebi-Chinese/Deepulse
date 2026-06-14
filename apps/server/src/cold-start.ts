// Cold start · 启动时把 DB 持久化的 cookie 装回 NCM client，
// 如果 snapshot 缺或太老则尝试拉新的, 并 distill NCM 画像写入 long-term (PRD-005)

import { distillNcmTaste } from '@deepulse/application'

import type { Container } from './composition.js'
import type {
  HydratedSnapshot,
  HydratedSong,
  INcmClient,
  NcmUserSnapshot,
} from '@deepulse/application'
import type { Logger } from '@deepulse/shared'
import type { SongId } from '@deepulse/domain'

const HOUR_MS = 60 * 60 * 1000
const SNAPSHOT_TTL_MS = 24 * HOUR_MS

// PRD-005 hydrate sample sizes (用户决议: top10 周排行 + 20 收藏样本 + FM 跳过全)
const HYDRATE_TOP_PLAYED = 10
const HYDRATE_LIKED_SAMPLE = 20

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
  let freshSnap: NcmUserSnapshot | null = null
  try {
    freshSnap = await container.ncm.fetchUserSnapshot()
    await container.snapshot.save(freshSnap)
    logger.info(
      {
        userId: freshSnap.userId,
        userName: freshSnap.userName,
        vipType: freshSnap.vipType,
        liked: freshSnap.likedSongIds.length,
        playlists: freshSnap.playlists.length,
      },
      'cold-start: snapshot saved',
    )
  } catch (err) {
    logger.warn({ err }, 'cold-start: snapshot fetch failed (will retry on next start)')
  }

  // 5) PRD-005: hydrate + distill NCM 画像 → long-term
  if (freshSnap !== null) {
    await distillSnapshotToLongTerm(container, freshSnap, logger)
  }
}

// PRD-005: hydrate snapshot SongIds → 歌名, LLM 分析推断 → append long-term
// 失败不挡 cold-start (NCM song/detail 反爬 / LLM 抽风都容错)
async function distillSnapshotToLongTerm(
  container: Container,
  snap: NcmUserSnapshot,
  logger: Logger,
): Promise<void> {
  try {
    const hydrated = await hydrateSnapshot(container.ncm, snap)
    const result = await distillNcmTaste(
      {
        brain: container.brain,
        log: {
          warn: (msg, err) => {
            logger.warn({ err }, msg)
          },
        },
      },
      { snapshot: snap, hydrated },
    )
    if (!result.ok) {
      logger.warn({ reason: result.reason }, 'cold-start: NCM distill failed')
      return
    }
    if (result.summary === null) {
      logger.info('cold-start: NCM distill skipped (画像太薄弱)')
      return
    }
    await container.longTerm.append({ tsMs: Date.now(), summary: result.summary })
    logger.info({ summaryLen: result.summary.length }, 'cold-start: NCM 画像写入 long-term')
  } catch (err) {
    logger.warn({ err }, 'cold-start: NCM distill 整体失败 (不挡 server 启动)')
  }
}

async function hydrateSnapshot(ncm: INcmClient, snap: NcmUserSnapshot): Promise<HydratedSnapshot> {
  const topPlayedIds = snap.recentPlayed.slice(0, HYDRATE_TOP_PLAYED).map((p) => p.songId)
  const likedSampleIds = sampleN(snap.likedSongIds, HYDRATE_LIKED_SAMPLE)
  const fmTrashIds = snap.fmTrashSongIds

  // 合并去重 + 一次批拉
  const allIds = Array.from(new Set([...topPlayedIds, ...likedSampleIds, ...fmTrashIds]))
  const songsMap = await ncm.batchSongDetail(allIds)

  const toHydrated = (id: SongId): HydratedSong | null => {
    const song = songsMap.get(id)
    if (song === undefined) return null
    return {
      title: song.title,
      artist: song.artists.map((a) => a.name).join('/') || '未知',
    }
  }

  const recentPlayedTop = snap.recentPlayed
    .slice(0, HYDRATE_TOP_PLAYED)
    .map((p) => {
      const h = toHydrated(p.songId)
      return h !== null ? { ...h, playCount: p.playCount } : null
    })
    .filter((s): s is HydratedSong & { playCount: number } => s !== null)

  const likedSample = likedSampleIds.map(toHydrated).filter((s): s is HydratedSong => s !== null)

  const fmTrashAll = fmTrashIds.map(toHydrated).filter((s): s is HydratedSong => s !== null)

  return { recentPlayedTop, likedSample, fmTrashAll }
}

// Fisher-Yates 截断: 从 arr 随机抽 n 个 (不放回). n >= arr.length 时返全
// cold-start 跑一次, Math.random 在这 OK (不是热路径, 不影响测试)
function sampleN<T>(arr: readonly T[], n: number): readonly T[] {
  if (arr.length <= n) return arr
  const copy = [...arr]
  for (let i = copy.length - 1; i > arr.length - n - 1; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i] as T
    copy[i] = copy[j] as T
    copy[j] = tmp
  }
  return copy.slice(arr.length - n)
}
