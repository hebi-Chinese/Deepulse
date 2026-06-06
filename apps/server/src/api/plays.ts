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
      // 把每条 play 跟 songs 表 join, 前端拿 title/artist 才能显示
      // 同 song 多次播缓存查 1 次, 不 N+1
      const songCache = new Map<string, Awaited<ReturnType<typeof container.songs.findById>>>()
      const enriched = await Promise.all(
        rows.map(async (r) => {
          let song = songCache.get(r.songId)
          if (song === undefined) {
            song = await container.songs.findById(r.songId)
            songCache.set(r.songId, song)
          }
          return {
            playedAtMs: r.playedAtMs,
            finished: r.finished,
            source: r.source,
            song,
          }
        }),
      )
      // 过滤掉 song = null (songs 表没缓存到, 说明该 song 元数据丢了, 跳过 UI)
      return { plays: enriched.filter((e) => e.song !== null) }
    })
  }
}
