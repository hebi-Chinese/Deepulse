/* eslint-disable @typescript-eslint/require-await -- Fastify plugin signature is async */
// Plays API · 听歌历史
import { toSongId } from '@claudio/domain'
import { z } from 'zod'

import type { Container } from '../composition.js'
import type { FastifyPluginAsync } from 'fastify'

const recordBody = z.object({
  songId: z.string().min(1),
  finished: z.boolean(),
  source: z.enum(['plan', 'fm', 'manual', 'recommendation', 'search']),
})

const recentQuery = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
})

export function createPlaysPlugin(container: Container): FastifyPluginAsync {
  return async (app) => {
    app.post('/api/plays', async (req) => {
      const body = recordBody.parse(req.body)
      await container.plays.recordPlay({
        songId: toSongId(body.songId),
        playedAtMs: container.clock.nowMs(),
        finished: body.finished,
        source: body.source,
      })
      return { ok: true }
    })

    app.get('/api/plays/recent', async (req) => {
      const { limit } = recentQuery.parse(req.query)
      const rows = await container.plays.recentPlays(limit ?? 50)
      return { plays: rows }
    })
  }
}
