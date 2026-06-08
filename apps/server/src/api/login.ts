/* eslint-disable @typescript-eslint/require-await -- Fastify plugin signature is async */
// 网易云扫码登录 API · route 层只做 HTTP framing, 编排在 completeQrLogin use case

import { completeQrLogin, type UseCaseLogger } from '@claudio/application'
import { z } from 'zod'

import type { Container } from '../composition.js'
import type { FastifyPluginAsync } from 'fastify'

const checkQuery = z.object({
  unikey: z.string().min(1),
  // 用户在登录前勾选 "记住我" 才会传 persist=1
  // 不勾 → 只在当前 server 进程内存里有 cookie, 服务重启就丢, 不入 DB
  // 勾了 → cookie 同时存 DB, 重启后 cold-start 自动恢复
  persist: z.enum(['0', '1']).optional().default('0'),
})

export function createLoginPlugin(container: Container): FastifyPluginAsync {
  return async (app) => {
    app.post('/api/login/qr/create', async () => {
      return await container.ncm.qrCreate()
    })

    app.get('/api/login/qr/check', async (req) => {
      const { unikey, persist } = checkQuery.parse(req.query)
      const status = await container.ncm.qrCheck(unikey)
      if (status.state === 'success') {
        const ucLog: UseCaseLogger = {
          warn: (m: string, err?: unknown) => {
            app.log.warn({ err }, m)
          },
        }
        await completeQrLogin(
          {
            ncm: container.ncm,
            account: container.account,
            snapshot: container.snapshot,
            clock: container.clock,
            log: ucLog,
          },
          { cookie: status.cookie, persist: persist === '1' },
        )
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
