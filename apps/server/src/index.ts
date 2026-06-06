// Claudio Server · Fastify 入口
// 流程：loadEnv → composition → cold-start → registerPlugins → listen

import { createLogger, loadEnv } from '@claudio/shared'
import cors from '@fastify/cors'
import websocketPlugin from '@fastify/websocket'
import Fastify from 'fastify'
import { ZodError } from 'zod'

import { createDiscoverPlugin } from './api/discover.js'
import { createDjSubtitlePlugin } from './api/dj-subtitle.js'
import { createDjWsPlugin } from './api/dj-ws.js'
import { createFeedbackPlugin } from './api/feedback.js'
import { createLoginPlugin } from './api/login.js'
import { createPlaylistPlugin } from './api/playlist.js'
import { createPlaysPlugin } from './api/plays.js'
import { createSearchPlugin } from './api/search.js'
import { createSnapshotPlugin } from './api/snapshot.js'
import { createSongPlugin } from './api/song.js'
import { runColdStart } from './cold-start.js'
import { buildContainer } from './composition.js'

import type { Container } from './composition.js'

// 结构化 generic 比 ReturnType<typeof Fastify> 准 — 后者经 overload 推成 any
type AppLike = { readonly close: () => Promise<unknown> }
type LogLike = {
  readonly info: (o: unknown, m?: string) => void
  readonly error: (o: unknown, m?: string) => void
}

// 启动配置全量 log — 排查 "fetch failed" / "没声音" 时一眼看到选了啥实现
// (key 只打前 8 位防泄漏)
function logStartupConfig(env: ReturnType<typeof loadEnv>, log: LogLike): void {
  log.info(
    {
      brainType: env.BRAIN_TYPE,
      deepseekUrl: env.DEEPSEEK_URL ?? '(none)',
      ollamaUrl: env.OLLAMA_URL ?? '(none)',
      openaiBaseUrl: env.OPENAI_BASE_URL ?? '(none)',
      openaiModel: env.OPENAI_MODEL,
      openaiKeyPrefix: env.OPENAI_API_KEY?.slice(0, 8) ?? '(none)',
      ttsType: env.TTS_TYPE,
      ttsUrl: env.TTS_URL,
      voxcpmUrl: env.VOXCPM_URL ?? '(none)',
      voxcpmVoiceDesign: env.VOXCPM_VOICE_DESIGN,
      dbUrl: env.DATABASE_URL,
      redisUrl: env.REDIS_URL ?? '(none, in-memory fallback)',
    },
    'container ready',
  )
}

function installShutdown(app: AppLike, container: Container, log: LogLike): void {
  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down')
    try {
      await app.close()
      container.db.close()
    } catch (err) {
      log.error({ err }, 'shutdown error')
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

async function main(): Promise<void> {
  const env = loadEnv()
  const logger = createLogger({
    name: 'server',
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    pretty: env.NODE_ENV !== 'production',
  })

  const container = buildContainer(env)
  logStartupConfig(env, logger)

  await runColdStart(container, logger)

  const app = Fastify({ loggerInstance: logger })

  // ZodError → 400 + issues, 其他错 → 500 不漏堆栈
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      req.log.warn({ issues: err.issues, path: req.url }, 'validation failed')
      return reply.code(400).send({ error: 'Invalid request', issues: err.issues })
    }
    req.log.error({ err, path: req.url }, 'request failed')
    return reply.code(500).send({ error: 'Internal error' })
  })

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
  await app.register(createDjSubtitlePlugin(container))
  await app.register(createDjWsPlugin(container))

  installShutdown(app, container, logger)

  try {
    await app.listen({ port: env.SERVER_PORT, host: '127.0.0.1' })
    logger.info({ port: env.SERVER_PORT }, 'server listening')
  } catch (err) {
    logger.error({ err }, 'server failed to start')
    process.exit(1)
  }
}

void main()
