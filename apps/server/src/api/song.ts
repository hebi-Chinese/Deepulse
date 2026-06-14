/* eslint-disable @typescript-eslint/require-await -- Fastify plugin signature is async */
// 歌曲直链 + 歌词 API

import { toSongId } from '@deepulse/domain'
import { z } from 'zod'

import type { Container } from '../composition.js'
import type { FastifyPluginAsync } from 'fastify'

const idParams = z.object({ id: z.string().min(1) })
const urlQuery = z.object({
  quality: z.enum(['standard', 'exhigh', 'lossless', 'hires']).default('standard'),
})

export function createSongPlugin(container: Container): FastifyPluginAsync {
  return async (app) => {
    app.get('/api/song/:id/url', async (req) => {
      const { id } = idParams.parse(req.params)
      const { quality } = urlQuery.parse(req.query)
      const url = await container.ncm.getSongUrl(toSongId(id), quality)
      return { url, quality }
    })

    app.get('/api/song/:id/lyric', async (req) => {
      const { id } = idParams.parse(req.params)
      const lyric = await container.ncm.getLyric(toSongId(id))
      return lyric
    })
  }
}
