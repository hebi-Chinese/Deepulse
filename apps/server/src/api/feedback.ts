/* eslint-disable @typescript-eslint/require-await -- Fastify plugin signature is async */
// 喜欢 / 拉黑 API（写回 NCM）

import { toSongId } from '@deepulse/domain'
import { z } from 'zod'

import type { Container } from '../composition.js'
import type { FastifyPluginAsync } from 'fastify'

const bodySchema = z.object({
  songId: z.string().min(1),
  action: z.enum(['like', 'unlike', 'trash']),
})

export function createFeedbackPlugin(container: Container): FastifyPluginAsync {
  return async (app) => {
    app.post('/api/feedback', async (req, reply) => {
      const body = bodySchema.parse(req.body)
      const songId = toSongId(body.songId)
      switch (body.action) {
        case 'like':
          await container.ncm.like(songId, true)
          return { ok: true }
        case 'unlike':
          await container.ncm.like(songId, false)
          return { ok: true }
        case 'trash':
          await container.ncm.fmTrash(songId)
          return { ok: true }
        default: {
          const _exhaustive: never = body.action
          return reply.code(400).send({ error: `unknown action: ${_exhaustive as string}` })
        }
      }
    })
  }
}
