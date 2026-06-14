/* eslint-disable @typescript-eslint/require-await -- Fastify plugin signature is async */
// 歌单曲目 API · 拉某个歌单里的全部歌曲

import { toPlaylistId } from '@deepulse/domain'
import { z } from 'zod'

import type { Container } from '../composition.js'
import type { FastifyPluginAsync } from 'fastify'

const idParams = z.object({ id: z.string().min(1) })
const limitQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
})

export function createPlaylistPlugin(container: Container): FastifyPluginAsync {
  return async (app) => {
    app.get('/api/playlists/mine', async (_req, reply) => {
      if (container.ncm.getCookie() === undefined) {
        return reply.code(401).send({ error: 'not logged in' })
      }
      const playlists = await container.ncm.getMyPlaylists()
      return { playlists }
    })

    app.get('/api/playlist/:id/tracks', async (req) => {
      const { id } = idParams.parse(req.params)
      const { limit } = limitQuery.parse(req.query)
      const opts = limit !== undefined ? { limit } : undefined
      const songs = await container.ncm.getPlaylistTracks(toPlaylistId(id), opts)
      return { songs }
    })
  }
}
