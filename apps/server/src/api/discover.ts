/* eslint-disable @typescript-eslint/require-await -- Fastify plugin signature is async */
// 发现 API: 每日推荐 / 私人 FM / 心动 / 排行
import { toSongId } from '@claudio/domain'
import { z } from 'zod'

import type { Container } from '../composition.js'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'

const idParams = z.object({ id: z.string().min(1) })

export function createDiscoverPlugin(container: Container): FastifyPluginAsync {
  return async (app) => {
    // daily/fm/heartMode 没登录时 NCM 会静默返回空数据 → 路由就给 200 + {songs:[]},
    // 调用方分不清"真的没歌"还是"没登录". 显式 401 让 UI 能引导扫码登录
    const requireLogin = (reply: FastifyReply): boolean => {
      if (container.ncm.getCookie() !== undefined) return true
      void reply.code(401).send({ error: 'not logged in' })
      return false
    }

    app.get('/api/recommend/daily', async (_req, reply) => {
      if (!requireLogin(reply)) return reply
      return { songs: await container.ncm.dailyRecommendations() }
    })

    app.get('/api/fm/next', async (_req, reply) => {
      if (!requireLogin(reply)) return reply
      return { songs: await container.ncm.privateFm() }
    })

    app.get('/api/heart-mode/:id', async (req, reply) => {
      if (!requireLogin(reply)) return reply
      const { id } = idParams.parse(req.params)
      return { songs: await container.ncm.heartMode(toSongId(id)) }
    })

    app.get('/api/toplist/:id', async (req) => {
      const { id } = idParams.parse(req.params)
      return { songs: await container.ncm.toplist(id) }
    })
  }
}
