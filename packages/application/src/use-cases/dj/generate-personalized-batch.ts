// generatePersonalizedBatch use-case · 给"个性化"播放模式拉 5 首推荐歌
//
// 触发: 用户在 personalized (个性化) 模式听到最后一首时, PWA 调 server endpoint
//       /api/dj/personalized-batch, server route 调本 use case
//
// 编排:
//   1. snapshot.load() 读 DB 持久化的 NCM 用户画像 (含 likedSongIds 收藏列表)
//   2. 从 likedSongIds 随机 sample N1 个, ncm.batchSongDetail 拿歌名
//   3. ncm.personalFm() 调 NCM 私人 FM 拿 N2 首
//   4. 合并去重 (excludeIds 是 PWA 传来的 queue 已有 SongId), 截前 count 首返
//
// 配额: 默认 count=5, N1=3 (收藏), N2=3 (NCM FM). 总 6 首 → 去重后截 5
// 失败语义: snapshot 没拉 / 没登录 → ok:false reason (路由层返 400 + toast)

import type { UseCaseLogger } from './run-dj-turn.js'
import type { INcmClient, INcmSnapshotRepo } from '../../ports/index.js'
import type { Song, SongId } from '@deepulse/domain'

export type GeneratePersonalizedBatchDeps = {
  readonly ncm: INcmClient
  readonly snapshot: INcmSnapshotRepo
  readonly log?: UseCaseLogger
}

export type GeneratePersonalizedBatchInput = {
  readonly excludeIds: ReadonlySet<SongId>
  readonly count: number
}

export type GeneratePersonalizedBatchResult =
  | { readonly ok: true; readonly songs: readonly Song[] }
  | { readonly ok: false; readonly reason: string }

// 默认 sample 数 — N1 + N2 > count 是有意的, 让去重后还够 count
const DEFAULT_LIKED_SAMPLE = 3
const DEFAULT_FM_SAMPLE = 3

export async function generatePersonalizedBatch(
  deps: GeneratePersonalizedBatchDeps,
  input: GeneratePersonalizedBatchInput,
): Promise<GeneratePersonalizedBatchResult> {
  const snap = await deps.snapshot.load()
  if (snap === null) {
    return { ok: false, reason: 'no snapshot — log in to NCM first' }
  }

  // Step 1: 从 likedSongIds 收藏 sample, hydrate 拿歌名
  const likedIds = sampleN(snap.likedSongIds, DEFAULT_LIKED_SAMPLE)
  const likedMap = likedIds.length > 0 ? await deps.ncm.batchSongDetail(likedIds) : null
  const likedSongs: Song[] =
    likedMap !== null
      ? likedIds.map((id) => likedMap.get(id)).filter((s): s is Song => s !== undefined)
      : []

  // Step 2: NCM personalFm (私人 FM) — 失败容错 (没登录会抛, 此时退化只用 liked)
  let fmSongs: readonly Song[] = []
  try {
    const fmAll = await deps.ncm.privateFm()
    fmSongs = fmAll.slice(0, DEFAULT_FM_SAMPLE)
  } catch (err: unknown) {
    deps.log?.warn('generatePersonalizedBatch: privateFm failed (continue with liked only)', err)
  }

  // Step 3: 合并 → 去重 (排除 excludeIds + 内部 ID 重复) → 截前 count
  const merged = mergeUnique([...likedSongs, ...fmSongs], input.excludeIds)
  const final = merged.slice(0, input.count)

  if (final.length === 0) {
    return { ok: false, reason: 'no fresh songs available (all liked sample already in queue)' }
  }
  return { ok: true, songs: final }
}

// Fisher-Yates 截断 sample (跟 cold-start 那个一致)
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

function mergeUnique(songs: readonly Song[], excludeIds: ReadonlySet<SongId>): readonly Song[] {
  const seen = new Set<SongId>(excludeIds)
  const out: Song[] = []
  for (const s of songs) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    out.push(s)
  }
  return out
}
