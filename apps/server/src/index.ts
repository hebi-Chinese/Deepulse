// Claudio Server · Fastify 入口
// 流程：loadEnv → composition → cold-start → registerPlugins → listen

import { createLogger, loadEnv } from '@claudio/shared'
import cors from '@fastify/cors'
import websocketPlugin from '@fastify/websocket'
import Fastify from 'fastify'

import { createDiscoverPlugin } from './api/discover.js'
import { createDjWsPlugin } from './api/dj-ws.js'
import { createDjPlugin } from './api/dj.js'
import { createFeedbackPlugin } from './api/feedback.js'
import { createLoginPlugin } from './api/login.js'
import { createPlaylistPlugin } from './api/playlist.js'
import { createPlaysPlugin } from './api/plays.js'
import { createSearchPlugin } from './api/search.js'
import { createSnapshotPlugin } from './api/snapshot.js'
import { createSongPlugin } from './api/song.js'
import { runColdStart } from './cold-start.js'
import { buildContainer } from './composition.js'

async function main(): Promise<void> {
  const env = loadEnv()
  const logger = createLogger({
    name: 'server',
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    pretty: env.NODE_ENV !== 'production',
  })

  const container = buildContainer(env)
  logger.info({ brainType: env.BRAIN_TYPE, dbUrl: env.DATABASE_URL }, 'container ready')

  await runColdStart(container, logger)

  const app = Fastify({ loggerInstance: logger })

  await app.register(cors, {
    origin: [
      `http://localhost:${String(env.PWA_PORT)}`,
      `http://127.0.0.1:${String(env.PWA_PORT)}`,
    ],
    credentials: true,
  })

  // WS 必须在挂 route 之前 register; M3 流式 DJ 对话端点走 /api/dj/chat-ws
  // maxPayload 64KB — Zod 内层还有 text.max(500) 但内存防护必须在 framing 层
  // (默认 100MB 单帧, 一个误操作就能 OOM)
  await app.register(websocketPlugin, { options: { maxPayload: 64 * 1024 } })

  app.get('/health', () => ({ status: 'ok', version: '0.1.0' }))

  await app.register(createSearchPlugin(container))
  await app.register(createSongPlugin(container))
  await app.register(createDiscoverPlugin(container))
  await app.register(createLoginPlugin(container))
  await app.register(createFeedbackPlugin(container))
  await app.register(createSnapshotPlugin(container))
  await app.register(createPlaylistPlugin(container))
  await app.register(createPlaysPlugin(container))
  await app.register(createDjPlugin(container))
  await app.register(createDjWsPlugin(container))

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down')
    try {
      await app.close()
      container.db.close()
    } catch (err) {
      logger.error({ err }, 'shutdown error')
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  try {
    await app.listen({ port: env.SERVER_PORT, host: '127.0.0.1' })
    logger.info({ port: env.SERVER_PORT }, 'server listening')
  } catch (err) {
    logger.error({ err }, 'server failed to start')
    process.exit(1)
  }
}

void main()
