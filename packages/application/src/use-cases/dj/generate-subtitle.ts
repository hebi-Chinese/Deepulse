// generateSubtitle use-case · 切歌时让 brain 生成一句字幕 (流萤声口)
// 替代旧的 useDjCloud 本地模板抽签 — 主人提的"DJ 是字幕贡献者", 跟 chat 用同一套大脑.
//
// 输入:
//   - 当前歌 (title + artist)
//   - 上一首歌 (可选, 用于"接续"语气)
// 上下文:
//   - longTerm: 跨 session 记忆 (DJ 几天后回来还认得主人)
//   - prefs: 主人手写偏好
//   - session 内已经生成过的字幕 (Redis short-term 里, 让 DJ 不重复套路)
//
// 输出: 单句 ≤ 30 字中文, 不带任何控制标签
//
// 失败语义: brain 失败 → 返 null, 调用方 fallback 到本地模板 (UI 不能因为 brain 挂就空)

import { z } from 'zod'

import { buildSubtitlePrompt, type SubtitleSongRef } from '../../dj/prompt.js'

import type { UseCaseLogger } from './run-dj-turn.js'
import type { IBrain, ILongTermMemoryRepo, IUserPrefsRepo } from '../../ports/index.js'

export type { SubtitleSongRef }

export type GenerateSubtitleDeps = {
  readonly brain: IBrain
  readonly longTerm: ILongTermMemoryRepo
  readonly userPrefs: IUserPrefsRepo
  readonly nowMs: number
  readonly log?: UseCaseLogger
}

export type GenerateSubtitleInput = {
  readonly currentSong: SubtitleSongRef
  readonly previousSong?: SubtitleSongRef
  readonly userInitiated: boolean
  readonly signal?: AbortSignal
}

export type GenerateSubtitleResult = {
  /** brain 生成的字幕; brain 失败时为 null, 调用方 fallback */
  readonly text: string | null
}

const subtitleSchema = z.object({
  text: z.string().min(1).max(60),
})

export async function generateSubtitle(
  deps: GenerateSubtitleDeps,
  input: GenerateSubtitleInput,
): Promise<GenerateSubtitleResult> {
  // 长期记忆 + prefs 并行拉, 任一失败用空默认 (字幕场景比 chat 容错, 失败回退到模板)
  const [longTerm, prefs] = await Promise.all([
    deps.longTerm.load().catch(() => []),
    deps.userPrefs.load(deps.nowMs).catch(() => ({ longTerm: '', shortTerm: '' })),
  ])

  const messages = buildSubtitlePrompt({
    currentSong: input.currentSong,
    userInitiated: input.userInitiated,
    longTerm,
    prefs,
    ...(input.previousSong !== undefined ? { previousSong: input.previousSong } : {}),
  })

  try {
    const parsed = await deps.brain.generateJson(messages, subtitleSchema, {
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
      maxTokens: 80,
    })
    return { text: parsed.text.trim() }
  } catch (err: unknown) {
    deps.log?.warn('generateSubtitle: brain.generateJson failed', err)
    return { text: null }
  }
}
