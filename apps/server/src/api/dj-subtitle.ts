/* eslint-disable @typescript-eslint/require-await -- Fastify plugin signature is async */
// DJ Subtitle API · 切歌时给前端一句字幕 + TTS 音频 (走 brain + tts)
//
// 流程:
//   1. brain (generateSubtitle) 产文本
//   2. tts.synthesize(text) 拿 audioUrl
//   3. 一并返回 {text, audioUrl}
//
// 容错: brain 文本必须有 (没字幕 UI 会空), tts 失败给 audioUrl=null 让前端静默 — 文本
// 还能展示, 用户在 F12 见到 warn

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

      // tts 失败不挡字幕 — 文本还能展示, 用户在 log 里看到原因
      // brain 返 null 时跳过 tts (前端 fallback 本地模板, 没声音可接受)
      let audioUrl: string | null = null
      if (result.text !== null) {
        try {
          const tts = await container.tts.synthesize({ text: result.text, emotion: '中立' })
          audioUrl = tts.audioUrl
        } catch (err: unknown) {
          req.log.warn({ err, text: result.text }, 'subtitle TTS synthesize failed')
        }
      }

      return { text: result.text, audioUrl }
    })
  }
}
