/* eslint-disable @typescript-eslint/require-await -- Fastify plugin signature is async */
// 网易云扫码登录 API · 登录成功后 cookie 同时入 DB（重启保留）

import { z } from 'zod'

import type { Container } from '../composition.js'
import type { FastifyPluginAsync } from 'fastify'

const checkQuery = z.object({ unikey: z.string().min(1) })

export function createLoginPlugin(container: Container): FastifyPluginAsync {
  return async (app) => {
    app.post('/api/login/qr/create', async () => {
      return await container.ncm.qrCreate()
    })

    app.get('/api/login/qr/check', async (req) => {
      const { unikey } = checkQuery.parse(req.query)
      const status = await container.ncm.qrCheck(unikey)
      if (status.state === 'success') {
        container.ncm.setCookie(status.cookie)
        await container.account.saveCookie(status.cookie)
        // 后台拉一次 snapshot:登录后异步,失败不阻塞返回,但必须记 warn 日志
        // (用户可手动从 /api/snapshot/refresh 重试,所以不抛)
        void container.ncm
          .fetchUserSnapshot()
          .then((s) => container.snapshot.save(s))
          .catch((err: unknown) => {
            app.log.warn({ err }, 'login: post-login snapshot fetch failed')
          })
        return { state: 'success' as const }
      }
      return status
    })

    app.get('/api/login/status', () => {
      return { loggedIn: container.ncm.getCookie() !== undefined }
    })

    app.post('/api/login/logout', async () => {
      await container.account.clear()
      container.ncm.clearCookie()
      return { ok: true }
    })
  }
}
