// 用户对 DJ 记忆系统的需求 (用户 2026-06-07):
// - **短期记忆 (Redis 热缓存)**: 当前活跃 session 的对话流 + 临时意图.
//   session 由"空闲超时"切边界 — TTL 到期 → 当前 session 自动结束.
//   下次用户来 = 新 session, DJ 不接几天前的话头.
// - **长期记忆 (file 自动 distill)**: session 结束时 distill 出"值得长期记的"
//   写进 markdown 文件; 不把"上次没聊完的钩子"塞进去 — 那是短期的, 跟 session 一起丢.
// - 几天后用户回来: 长期记忆里有历史, DJ 可以自然问候; 但短期空, 不接遗留问题.

// ─── 短期记忆: session 内的 turn 流 ─────────────────────────────────────

export type SessionTurn = {
  readonly tsMs: number
  readonly userMsg: string
  readonly djReply: string
}

export type IShortTermMemoryRepo = {
  /** 追加一条 turn, 顺手刷新 session TTL (idle timeout 重置) */
  appendTurn(turn: SessionTurn): Promise<void>
  /** 当前 session 的所有 turn (按时间顺序), session 不在 → 空数组 */
  loadCurrentSession(): Promise<readonly SessionTurn[]>
  /** session 是否活跃 (TTL 没过期) */
  isSessionActive(): Promise<boolean>
  /** 清掉当前 session (distill 完后调用, 切断历史) */
  clearSession(): Promise<void>
  /** 用户手动结束当前 session (e.g. "再见"按钮 / 切窗户) — 立即过期 */
  endSession(): Promise<void>
}

// ─── 长期记忆: 跨 session 的累积事实 ────────────────────────────────────

export type LongTermEntry = {
  /** 这条 entry 是什么时候 distill 出来的 (epoch ms) */
  readonly tsMs: number
  /** distill 出的总结文本 (1-2 句中文, DJ 第三人称视角) */
  readonly summary: string
}

export type ILongTermMemoryRepo = {
  /** 读所有长期记忆 (按时间顺序, 老的在前) */
  load(): Promise<readonly LongTermEntry[]>
  /** distill 完一个 session 后追加一条 */
  append(entry: LongTermEntry): Promise<void>
}
