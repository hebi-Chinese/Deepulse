// distillNcmTaste use-case · 把 NCM 用户画像数据 distill 成自然语言"喜好推断"
//
// 触发时机: cold-start 拉 snapshot + hydrate 后调一次 (24h TTL)
//
// 跟 distillSession 的区别:
//   - 输入是 NCM 客观数据 (周排行 / 收藏 / 风格标签 / 歌单名), 不是对话
//   - 不做 session 清理 (无 shortTerm 副作用)
//   - 调用方 (cold-start) 拿到 summary 后自己 append 进 long-term
//
// 这里只做"画像分析"一件事, 不编排副作用 — 让 cold-start 主控流程

import { z } from 'zod'

import type { UseCaseLogger } from './run-dj-turn.js'
import type { IBrain, NcmUserSnapshot } from '../../ports/index.js'

// hydrated SongId 解析出来的最小元信息
export type HydratedSong = {
  readonly title: string
  readonly artist: string
}

export type HydratedSnapshot = {
  /** 周排行 top N, 按 playCount 降序 */
  readonly recentPlayedTop: readonly (HydratedSong & { playCount: number })[]
  /** 收藏歌曲样本 (从 likedSongIds 随机 sample N 个) */
  readonly likedSample: readonly HydratedSong[]
  /** FM 跳过的歌 (当前 snapshot 实现里这个字段是空, 占位) */
  readonly fmTrashAll: readonly HydratedSong[]
}

export type DistillNcmTasteDeps = {
  readonly brain: IBrain
  readonly log?: UseCaseLogger
}

export type DistillNcmTasteInput = {
  readonly snapshot: NcmUserSnapshot
  readonly hydrated: HydratedSnapshot
}

export type DistillNcmTasteResult =
  | { readonly ok: true; readonly summary: string | null }
  | { readonly ok: false; readonly reason: string }

// brain 返回结构 — worthKeeping=false 表示画像太薄弱, summary 留空
const distillRespSchema = z.object({
  summary: z.string(),
  worthKeeping: z.boolean(),
})

const SYSTEM_PROMPT = `你是这位听众的"音乐画像分析师"。我会给你 TA 在网易云音乐的客观数据:

- NCM 自己标记的风格偏好 (TA 在 NCM 选过的风格标签)
- TA 最近一周听最多的歌 (周排行)
- TA 收藏的歌的样本
- TA 自建的歌单标题
- TA 喜欢的歌的总数

你要分析归纳出 TA **真正喜欢什么**, 用 2-3 句话总结. 维度任选其一或组合:

- 风格偏好 (古典/流行/电子/独立/日系/欧美/华语...)
- 情绪倾向 (深夜/治愈/振奋/伤感/燃...)
- 时代/地区 (老歌/华语/欧美/日韩...)
- 高频艺人 (排行 + 收藏交集)

**不要**列具体歌名/艺人/数字 — 是**推断画像**, 不是"列报表". DJ 看了你的总结要能自然引用 (如"听你最近一直在听 lo-fi"), 不是"你这周听了 xx 次 yy 歌".

输出 JSON: { "summary": "2-3 句中文画像总结, 第三人称'这位听众'或'TA'", "worthKeeping": true|false }
画像数据太薄弱 (e.g. 周排行+收藏样本都空) 就 worthKeeping=false, summary 留空.`

export async function distillNcmTaste(
  deps: DistillNcmTasteDeps,
  input: DistillNcmTasteInput,
): Promise<DistillNcmTasteResult> {
  const userBlock = buildUserBlock(input.snapshot, input.hydrated)
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: userBlock },
  ]

  let parsed: z.infer<typeof distillRespSchema>
  try {
    parsed = await deps.brain.generateJson(messages, distillRespSchema)
  } catch (err: unknown) {
    deps.log?.warn('distillNcmTaste: brain.generateJson failed', err)
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }

  if (!parsed.worthKeeping || parsed.summary.trim().length === 0) {
    return { ok: true, summary: null }
  }
  return { ok: true, summary: parsed.summary.trim() }
}

// 拼装给 LLM 看的"客观数据"段
function buildUserBlock(snap: NcmUserSnapshot, hydrated: HydratedSnapshot): string {
  const parts: string[] = []

  if (snap.stylePreferences.length > 0) {
    parts.push(`## NCM 标的风格偏好\n${snap.stylePreferences.join('、')}`)
  }

  if (hydrated.recentPlayedTop.length > 0) {
    const lines = hydrated.recentPlayedTop
      .map((s) => `- ${s.title} · ${s.artist} (${String(s.playCount)} 次)`)
      .join('\n')
    parts.push(`## 最近一周听最多 (top ${String(hydrated.recentPlayedTop.length)})\n${lines}`)
  }

  if (hydrated.likedSample.length > 0) {
    const lines = hydrated.likedSample.map((s) => `- ${s.title} · ${s.artist}`).join('\n')
    parts.push(`## 收藏样本 (从 ${String(snap.likedSongIds.length)} 首随机抽)\n${lines}`)
  }

  if (hydrated.fmTrashAll.length > 0) {
    const lines = hydrated.fmTrashAll.map((s) => `- ${s.title} · ${s.artist}`).join('\n')
    parts.push(`## FM 跳过的歌 (TA 不想要)\n${lines}`)
  }

  if (snap.playlists.length > 0) {
    const names = snap.playlists
      .slice(0, 10)
      .map((p) => p.name)
      .join('、')
    parts.push(`## 自建/收藏歌单标题 (前 10)\n${names}`)
  }

  parts.push(`## 喜欢的歌总数\n${String(snap.likedSongIds.length)} 首`)

  return parts.join('\n\n')
}
