// Claudio Server · Fastify 入口
// 流程：loadEnv → composition → cold-start → registerPlugins → listen

import { createLogger, loadEnv } from '@claudio/shared'
import cors from '@fastify/cors'
import Fastify from 'fastify'

import { createDiscoverPlugin } from './api/discover.js'
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
