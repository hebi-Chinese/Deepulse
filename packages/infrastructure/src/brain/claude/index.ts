// Claude Code 子进程实现 IBrain
// stream(): 调 `claude -p --output-format stream-json`,逐 text_delta 吐出
// generateJson(): 调 `claude -p --output-format json --json-schema ...`,zod 二次校验
//
// 关键依赖: execa(进程) + zod-to-json-schema(zod→JSON Schema)

import { TextDecoder } from 'node:util'

import { ExternalServiceError } from '@claudio/shared'
import { execa } from 'execa'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

import { splitMessages } from './prompt.js'
import { parseStreamLine } from './stream-parser.js'

import type { IBrain, BrainMessage, BrainGenerateOptions } from '@claudio/application'

// 故意不约束 spawn() 返回类型,让 TS 直接推 execa 的具体 Result 形状,
// 避免 exactOptionalPropertyTypes 把通用 Options 和具体调用打架

const CLI_BIN = 'claude'
const DEFAULT_MAX_BUFFER = 16 * 1024 * 1024 // 16 MB 单条响应足够

type SpawnOptions = {
  readonly format: 'json' | 'stream-json'
  readonly systemPrompt: string | undefined
  readonly jsonSchema?: string
  readonly maxTokens?: number
  readonly signal?: AbortSignal
}

// 防御性: execa 用 execFile 不会有 shell injection,但 user-controlled value
// 如果以 '--' 开头可能被 CLI argparse 误解为 flag (吞掉后续 value)。
// 拒绝任何以 '--' 开头的 value;调用方应该用 trusted constant 或先 trim/escape
function assertSafeFlagValue(field: string, value: string): string {
  if (value.startsWith('--')) {
    throw new Error(`brain.spawn: ${field} starts with '--' (CLI flag confusion risk)`)
  }
  return value
}

export class ClaudeCodeBrain implements IBrain {
  constructor(private readonly bin: string = CLI_BIN) {}

  async *stream(
    messages: readonly BrainMessage[],
    options?: BrainGenerateOptions,
  ): AsyncIterable<string> {
    const { systemPrompt, userPrompt } = splitMessages(messages)
    const child = this.spawn(userPrompt, {
      format: 'stream-json',
      systemPrompt,
      ...(options?.signal !== undefined ? { signal: options.signal } : {}),
      ...(options?.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
      // temperature: claude CLI 不支持透传,暂忽略 (留在 BrainGenerateOptions 给将来其他 IBrain 实现用)
    })

    // 用 try/finally 保证: 无论 caller break 出 for await 还是跑完,
    // child 都会被等到结束并检查 exitCode。否则提前 break 时 await child 永远不执行,
    // 失败状态被吞 + 子进程残留
    let aborted = true
    try {
      yield* readTextDeltas(child)
      aborted = false
    } finally {
      // 仅在 caller 提前退出时 kill 让 promise 立即 settle;自然完成时直接 await
      if (aborted) child.kill('SIGTERM')
      const result = await child
      // signal 终止 (caller cancel) 不算 error;exitCode !== 0 且无 signal 才报错
      if (!aborted && result.exitCode !== 0 && result.signal === undefined) {
        throw new ExternalServiceError(
          'claude',
          `exited ${String(result.exitCode)}: ${stringifyStream(result.stderr)}`,
        )
      }
    }
  }

  async generateJson<T>(
    messages: readonly BrainMessage[],
    schema: z.ZodSchema<T>,
    options?: BrainGenerateOptions,
  ): Promise<T> {
    const { systemPrompt, userPrompt } = splitMessages(messages)
    const jsonSchema = JSON.stringify(zodToJsonSchema(schema, { target: 'jsonSchema7' }))

    const child = this.spawn(userPrompt, {
      format: 'json',
      systemPrompt,
      jsonSchema,
      ...(options?.signal !== undefined ? { signal: options.signal } : {}),
      ...(options?.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
    })
    const result = await child
    if (result.exitCode !== 0) {
      throw new ExternalServiceError(
        'claude',
        `exited ${String(result.exitCode)}: ${stringifyStream(result.stderr)}`,
      )
    }

    return parseGenerateJsonResult(stringifyStream(result.stdout), schema)
  }

  private spawn(prompt: string, opts: SpawnOptions) {
    const args: string[] = ['-p', '--output-format', opts.format]
    if (opts.format === 'stream-json') args.push('--verbose')
    if (opts.systemPrompt !== undefined && opts.systemPrompt.length > 0) {
      args.push('--system-prompt', assertSafeFlagValue('systemPrompt', opts.systemPrompt))
    }
    if (opts.jsonSchema !== undefined) {
      args.push('--json-schema', assertSafeFlagValue('jsonSchema', opts.jsonSchema))
    }
    if (opts.maxTokens !== undefined) {
      args.push('--max-tokens', String(opts.maxTokens))
    }
    args.push(assertSafeFlagValue('prompt', prompt))

    return execa(this.bin, args, {
      maxBuffer: DEFAULT_MAX_BUFFER,
      reject: false,
      ...(opts.signal !== undefined ? { cancelSignal: opts.signal } : {}),
    })
  }
}

function stringifyStream(v: unknown): string {
  if (typeof v === 'string') return v
  if (v === undefined || v === null) return ''
  if (v instanceof Uint8Array) return new TextDecoder().decode(v)
  if (Array.isArray(v)) return v.map((item: unknown) => stringifyStream(item)).join('\n')
  if (typeof v === 'object') return JSON.stringify(v)
  return typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''
}

type WithStdout = {
  readonly stdout?: AsyncIterable<unknown> | null
}

async function* readTextDeltas(child: WithStdout): AsyncIterable<string> {
  const stdout = child.stdout
  if (stdout === null || stdout === undefined) {
    throw new ExternalServiceError('claude', 'stdout pipe missing')
  }

  // 共享一个 TextDecoder + stream:true,跨 chunk 的 UTF-8 多字节序列才不会被切断
  // (流萤声线播报全中文,Claude 流式输出极易在中文字符中间断 chunk)
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  for await (const chunk of stdout) {
    buffer += decodeChunk(chunk, decoder)
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    yield* yieldTextLines(lines)
  }
  // flush 末尾未完整字节 (decoder.decode() 无参数 = stream 结束)
  buffer += decoder.decode()
  if (buffer.length > 0) {
    yield* yieldTextLines([buffer])
  }
}

function decodeChunk(chunk: unknown, decoder: TextDecoder): string {
  if (typeof chunk === 'string') return chunk
  if (chunk instanceof Uint8Array) return decoder.decode(chunk, { stream: true })
  return stringifyStream(chunk)
}

function* yieldTextLines(lines: readonly string[]): Generator<string> {
  for (const line of lines) {
    const parsed = parseStreamLine(line)
    if (parsed.kind === 'text') yield parsed.text
    if (parsed.kind === 'result' && parsed.isError) {
      throw new ExternalServiceError('claude', `reported error: ${parsed.result}`)
    }
  }
}

// claude --output-format json 的包裹对象 schema(只取我们关心的字段)
const envelopeSchema = z.object({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- claude CLI 输出字段
  is_error: z.boolean(),
  result: z.string().optional(),
})

function parseGenerateJsonResult<T>(stdout: string, schema: z.ZodSchema<T>): T {
  const envelope = parseJson(stdout, 'envelope')
  const validated = envelopeSchema.safeParse(envelope)
  if (!validated.success) {
    throw new ExternalServiceError('claude', `envelope shape invalid: ${validated.error.message}`)
  }
  if (validated.data.is_error) {
    throw new ExternalServiceError(
      'claude',
      `reported error: ${validated.data.result ?? 'unknown'}`,
    )
  }
  const raw = validated.data.result
  if (raw === undefined) {
    throw new ExternalServiceError('claude', 'envelope.result missing')
  }

  const inner = parseJson(raw, 'result.body')
  const innerResult = schema.safeParse(inner)
  if (!innerResult.success) {
    throw new ExternalServiceError(
      'claude',
      `result.body shape invalid: ${innerResult.error.message}`,
    )
  }
  return innerResult.data
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'parse failed'
    throw new ExternalServiceError(
      'claude',
      `${label} not valid JSON: ${reason} (raw=${raw.slice(0, 200)})`,
      undefined,
      { cause: err },
    )
  }
}
