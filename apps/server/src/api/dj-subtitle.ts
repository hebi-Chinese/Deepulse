/* eslint-disable @typescript-eslint/require-await -- Fastify plugin signature is async */
// DJ Subtitle API · 切歌时给前端一句字幕 (走 brain, 跟 chat 同套大脑)
// 替代旧前端 useDjCloud 的本地模板抽签 — 主人提的"DJ 是字幕贡献者"

import { generateSubtitle } from '@claudio/application'
import { z } from 'zod'

import type { Container } from '../composition.js'
import type { FastifyPluginAsync } from 'fastify'

const songRefSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200),
})

const subtitleBodySchema = z.object({
  currentSong: songRefSchema,
  previousSong: songRefSchema.optional(),
  userInitiated: z.boolean(),
})

export function createDjSubtitlePlugin(container: Container): FastifyPluginAsync {
  return async (app) => {
    app.post('/api/dj/subtitle', async (req) => {
      const body = subtitleBodySchema.parse(req.body)
      const result = await generateSubtitle(
        {
          brain: container.brain,
          longTerm: container.longTerm,
          userPrefs: container.userPrefs,
          nowMs: container.clock.nowMs(),
          log: {
            warn: (msg, err) => {
              req.log.warn({ err }, msg)
            },
          },
        },
        {
          currentSong: body.currentSong,
          userInitiated: body.userInitiated,
          ...(body.previousSong !== undefined ? { previousSong: body.previousSong } : {}),
        },
      )
      // 返回 null 让前端 fallback 到模板, 不抛 (字幕场景比 chat 宽容)
      return { text: result.text }
    })
  }
}
