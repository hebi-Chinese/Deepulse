// completeQrLogin use case · 用户扫码成功后的收尾编排
// - 把 cookie set 进 NCM client (内存, 必做)
// - 如果 persist=true 才入 DB (用户 opt-in)
// - 后台拉一次 user snapshot 给推荐用 (失败不影响登录)
// 失败语义: setCookie 永远不抛; saveCookie 失败 → 返 persistFailed=true (调用方决定是否暴露给前端);
// snapshot 失败 → log warn, 不影响登录主流程

import type { IClock, INcmAccountRepo, INcmClient, INcmSnapshotRepo } from '../../ports/index.js'
import type { UseCaseLogger } from '../dj/run-dj-turn.js'

export type CompleteQrLoginDeps = {
  readonly ncm: INcmClient
  readonly account: INcmAccountRepo
  readonly snapshot: INcmSnapshotRepo
  readonly clock: IClock
  readonly log?: UseCaseLogger
}

export type CompleteQrLoginInput = {
  readonly cookie: string
  readonly persist: boolean
}

export type CompleteQrLoginResult = {
  readonly ok: true
  /** persist=true 时, DB save 是否成功. false 表示内存已 set, 但下次重启会丢 */
  readonly persisted: boolean
}

export async function completeQrLogin(
  deps: CompleteQrLoginDeps,
  input: CompleteQrLoginInput,
): Promise<CompleteQrLoginResult> {
  // 内存设 cookie 永远先做 (本次会话立即可用)
  deps.ncm.setCookie(input.cookie)

  let persisted = false
  if (input.persist) {
    try {
      await deps.account.saveCookie(input.cookie)
      persisted = true
    } catch (err: unknown) {
      deps.log?.warn('completeQrLogin: account.saveCookie failed (in-memory only)', err)
    }
  }

  // 后台拉 snapshot, 不阻塞返回; 失败仅 warn (用户可手动 /api/snapshot/refresh 重试)
  void deps.ncm
    .fetchUserSnapshot()
    .then((snap) => deps.snapshot.save(snap))
    .catch((err: unknown) => {
      deps.log?.warn('completeQrLogin: post-login snapshot fetch failed', err)
    })

  // clock 当前未直接使用, 留作 hook (将来加 "上次登录时间" 之类需要时不需要改签名)
  void deps.clock
  return { ok: true, persisted }
}
