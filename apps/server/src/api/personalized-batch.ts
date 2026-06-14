/* eslint-disable @typescript-eslint/require-await -- Fastify plugin signature is async */
// Personalized Batch API · 给 PWA 的"个性化"播放模式拉 5 首推荐歌 (PRD-008)
//
// 流程: PWA 调本端点, 传当前 queue 里所有 SongId (excludeIds),
//       server 调 generatePersonalizedBatch use case 拼 5 首 (50% 收藏 + 50% NCM FM),
//       去重后返
//
// 失败 (没登录 / snapshot 没拉) → 400 + reason, PWA toast 提示用户登录

import { generatePersonalizedBatch } from '@deepulse/application'
import { toSongId } from '@deepulse/domain'
import { z } from 'zod'

import type { Container } from '../composition.js'
import type { FastifyPluginAsync } from 'fastify'

const reqBodySchema = z.object({
  excludeIds: z.array(z.string()).max(200), // cap 防恶意大 payload (queue 最多 150 首)
  count: z.number().int().positive().max(20).default(5),
})

export function createPersonalizedBatchPlugin(container: Container): FastifyPluginAsync {
  return async (app) => {
    app.post('/api/dj/personalized-batch', async (req, reply) => {
      const body = reqBodySchema.parse(req.body)
      const excludeSet = new Set(body.excludeIds.map(toSongId))

      const result = await generatePersonalizedBatch(
        {
          ncm: container.ncm,
          snapshot: container.snapshot,
          log: {
            warn: (msg, err) => {
              req.log.warn({ err }, msg)
            },
          },
        },
        {
          excludeIds: excludeSet,
          count: body.count,
        },
      )

      if (!result.ok) {
        return reply.code(400).send({ ok: false, reason: result.reason })
      }
      return { ok: true, songs: result.songs }
    })
  }
}
