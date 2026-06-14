// Pino 日志封装 · 结构化输出 + redact 敏感字段
// 用法：import { createLogger } from '@deepulse/shared/logger'

import { isatty } from 'node:tty'

import { pino, type Logger, type LoggerOptions } from 'pino'

const REDACT_PATHS = [
  'cookie',
  'password',
  'token',
  'authorization',
  '*.cookie',
  '*.password',
  '*.token',
  '*.authorization',
]

type CreateLoggerOptions = {
  name: string
  level?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
  pretty?: boolean
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const config: LoggerOptions = {
    name: options.name,
    level: options.level ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  }
  // pino-pretty transport worker 在 stdout 非 TTY (被 spawn 进 pipe) 时 sync-write 会阻塞 →
  // server 卡在第一行 log 走不到 app.listen(). 非 TTY 退回 sonic-boom 异步 stdout 即可.
  if (options.pretty && isatty(1)) {
    config.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
    }
  }
  return pino(config)
}

export type { Logger } from 'pino'
