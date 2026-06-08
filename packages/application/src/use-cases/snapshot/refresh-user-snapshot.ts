// refreshUserSnapshot use case · 用户手动触发拉新 NCM 快照
// 之前在 api/snapshot.ts:21-34 route 里直接编排 ncm.fetchUserSnapshot + snapshot.save
// 现在提到 use case, route 只调一次

import type { INcmClient, INcmSnapshotRepo, NcmUserSnapshot } from '../../ports/index.js'
import type { UseCaseLogger } from '../dj/run-dj-turn.js'

export type RefreshUserSnapshotDeps = {
  readonly ncm: INcmClient
  readonly snapshot: INcmSnapshotRepo
  readonly log?: UseCaseLogger
}

export type RefreshUserSnapshotResult = {
  readonly ok: true
  readonly snapshot: NcmUserSnapshot
}

export async function refreshUserSnapshot(
  deps: RefreshUserSnapshotDeps,
): Promise<RefreshUserSnapshotResult> {
  const snap = await deps.ncm.fetchUserSnapshot()
  await deps.snapshot.save(snap)
  return { ok: true, snapshot: snap }
}
