// distillSession use-case · session 边界过后, 把短期 turn 流 distill 进长期文件
//
// 触发时机:
//   - 进入 runDjTurn 前发现 shortTerm.isSessionActive()=false 且 loadCurrentSession() 非空
//     → 上次 session 已过期但还没 distill → 现在做
//   - 用户显式 endSession (按 "再见" / 切窗户) → 立刻调
//
// 失败语义:
//   - brain 失败 → 不 append, 不 clear (下次还能重试)
//   - long-term append 失败 → 不 clear (避免丢)
//   - 成功 → clearSession 切断
//
// 决策: 只 distill 不琐碎过滤. 让 prompt 引导 brain "只挑值得记的, 其它丢"
//       不在 use-case 层硬编码"X 条以下不 distill"等启发, 那是 brain 该判断的

import { z } from 'zod'

import { buildDistillPrompt } from '../../dj/prompt.js'

import type { UseCaseLogger } from './run-dj-turn.js'
import type {
  IBrain,
  IClock,
  ILongTermMemoryRepo,
  IShortTermMemoryRepo,
} from '../../ports/index.js'

export type DistillSessionDeps = {
  readonly brain: IBrain
  readonly shortTerm: IShortTermMemoryRepo
  readonly longTerm: ILongTermMemoryRepo
  readonly clock: IClock
  readonly log?: UseCaseLogger
}

export type DistillSessionResult =
  | { readonly ok: true; readonly summary: string | null }
  | { readonly ok: false; readonly reason: string }

// brain 返回的结构 — 允许 brain 说 "没啥值得记的" → summary 空
const distillRespSchema = z.object({
  summary: z.string(),
  worthKeeping: z.boolean(),
})

export async function distillSession(deps: DistillSessionDeps): Promise<DistillSessionResult> {
  const turns = await deps.shortTerm.loadCurrentSession()
  if (turns.length === 0) return { ok: true, summary: null }

  const messages = buildDistillPrompt(turns)
  let parsed: z.infer<typeof distillRespSchema>
  try {
    parsed = await deps.brain.generateJson(messages, distillRespSchema)
  } catch (err: unknown) {
    deps.log?.warn('distillSession: brain.generateJson failed', err)
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }

  if (!parsed.worthKeeping || parsed.summary.trim().length === 0) {
    // brain 自己判断没啥值得记 → 直接清掉 session, 不 append
    await deps.shortTerm.clearSession()
    return { ok: true, summary: null }
  }

  try {
    await deps.longTerm.append({ tsMs: deps.clock.nowMs(), summary: parsed.summary.trim() })
  } catch (err: unknown) {
    deps.log?.warn('distillSession: longTerm.append failed, keep session for retry', err)
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }

  await deps.shortTerm.clearSession()
  return { ok: true, summary: parsed.summary.trim() }
}
