// OpenAI-Compatible Brain · BYO LLM via /v1/chat/completions
//
// 覆盖范围:
//   - OpenAI 官方     (https://api.openai.com/v1)
//   - DeepSeek        (https://api.deepseek.com/v1)
//   - Ollama 本地     (http://localhost:11434/v1)
//   - vLLM / LMStudio / Llamafile / OpenRouter / Together / Groq / Perplexity ...
// 任何说自己 OpenAI-compatible 的服务. 用户在 .env 配 BASE_URL + MODEL + API_KEY 即可.
//
// 协议:
//   POST {baseUrl}/chat/completions
//   Body: { model, messages, stream?, response_format?, temperature?, max_tokens? }
//   Stream: SSE, 每行 `data: {json}` 直到 `data: [DONE]`

import { ExternalServiceError } from '@claudio/domain'
import { z } from 'zod'

import type { IBrain, BrainMessage, BrainGenerateOptions } from '@claudio/application'

export type OpenAICompatConfig = {
  /**
   * 解析 base URL 的函数 — 每次 fetch 调一次, 没必要静态字符串
   * 用户哲学: URL 一层, brand 专属, factory 各 case 自己决定函数体. 没有 "default URL"
   * 兜底 — resolver 自己根据 BRAIN_TYPE 该 throw 就 throw, 让 startup 立刻看到根因
   */
  readonly resolveEndpoint: () => string
  readonly apiKey: string | undefined
  readonly model: string
  readonly providerLabel?: string
}

// 默认 3 min — 比 DeepSeek/OpenAI 实际响应长得多 (流式偶尔卡 30s+),
// 同时挡住 brain 真死掉 (Ollama 冷启 / 网络挂) 让请求悬挂半小时把 WS 端拖死的极端
const DEFAULT_TIMEOUT_MS = 180_000

const streamChunkSchema = z.object({
  choices: z.array(
    z.object({
      delta: z.object({ content: z.string().optional() }).optional(),
    }),
  ),
})
const jsonRespSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
})

export class OpenAICompatBrain implements IBrain {
  private readonly providerLabel: string

  constructor(private readonly cfg: OpenAICompatConfig) {
    this.providerLabel = cfg.providerLabel ?? 'openai-compat'
  }

  /** 每次 fetch 重新 resolve — 用户哲学: brand 专属 URL, no caching */
  private endpoint(): string {
    return `${this.cfg.resolveEndpoint().replace(/\/$/, '')}/chat/completions`
  }

  async *stream(
    messages: readonly BrainMessage[],
    options?: BrainGenerateOptions,
  ): AsyncIterable<string> {
    // fetch 抛 TypeError("fetch failed") 时把 .cause 链拼进 message —
    // 否则上层只看到 "fetch failed" 完全没法诊断 (是 DNS / TLS / proxy / connect refused?)
    let res: Response
    try {
      res = await this.post(messages, options, true)
    } catch (err: unknown) {
      throw wrapFetchError(this.providerLabel, this.endpoint(), err)
    }
    if (!res.ok || res.body === null) {
      throw new ExternalServiceError(
        this.providerLabel,
        `HTTP ${String(res.status)} ${await safeText(res)}`,
      )
    }
    yield* parseSseContent(res.body, this.providerLabel)
  }

  async generateJson<T>(
    messages: readonly BrainMessage[],
    schema: z.ZodSchema<T>,
    options?: BrainGenerateOptions,
  ): Promise<T> {
    let res: Response
    try {
      res = await this.post(messages, options, false, { type: 'json_object' })
    } catch (err: unknown) {
      throw wrapFetchError(this.providerLabel, this.endpoint(), err)
    }
    if (!res.ok) {
      throw new ExternalServiceError(
        this.providerLabel,
        `HTTP ${String(res.status)} ${await safeText(res)}`,
      )
    }
    const raw: unknown = await res.json()
    const parsed = jsonRespSchema.safeParse(raw)
    if (!parsed.success) {
      throw new ExternalServiceError(
        this.providerLabel,
        `unexpected response shape: ${parsed.error.message}`,
      )
    }
    const content = parsed.data.choices[0]?.message.content
    if (content === undefined) {
      throw new ExternalServiceError(this.providerLabel, 'empty content in response')
    }
    let json: unknown
    try {
      json = JSON.parse(content)
    } catch (e: unknown) {
      throw new ExternalServiceError(
        this.providerLabel,
        `model returned non-JSON: ${e instanceof Error ? e.message : String(e)}`,
        undefined,
        { cause: e },
      )
    }
    const validated = schema.safeParse(json)
    if (!validated.success) {
      throw new ExternalServiceError(
        this.providerLabel,
        `response failed schema: ${validated.error.message}`,
      )
    }
    return validated.data
  }

  private async post(
    messages: readonly BrainMessage[],
    options: BrainGenerateOptions | undefined,
    stream: boolean,
    responseFormat?: { readonly type: 'json_object' },
  ): Promise<Response> {
    const body: Record<string, unknown> = {
      model: this.cfg.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream,
    }
    if (options?.maxTokens !== undefined) body['max_tokens'] = options.maxTokens
    if (options?.temperature !== undefined) body['temperature'] = options.temperature
    if (responseFormat !== undefined) body['response_format'] = responseFormat

    /* eslint-disable @typescript-eslint/naming-convention -- HTTP header names */
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.cfg.apiKey !== undefined && this.cfg.apiKey.length > 0) {
      headers['authorization'] = `Bearer ${this.cfg.apiKey}`
    }
    /* eslint-enable @typescript-eslint/naming-convention */

    return await fetch(this.endpoint(), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: mergeSignals(options?.signal),
    })
  }
}

// 合并 caller signal 跟默认 timeout — 任一触发就 abort. Node 20.3+ 有 AbortSignal.any,
// 老 node 兜底用 caller signal (没 caller 就只用 timeout)
function mergeSignals(callerSignal: AbortSignal | undefined): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  if (callerSignal === undefined) return timeoutSignal
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([callerSignal, timeoutSignal])
  }
  return callerSignal
}

// fetch 失败时拼根因 — undici 抛 TypeError("fetch failed") + .cause (ConnectError / DNS / TLS etc)
function wrapFetchError(provider: string, endpoint: string, err: unknown): ExternalServiceError {
  const top = err instanceof Error ? err.message : String(err)
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause : undefined
  const causeBits =
    cause !== undefined
      ? ` | cause: ${cause.name}: ${cause.message}${'code' in cause && typeof cause.code === 'string' ? ` (${cause.code})` : ''}`
      : ''
  return new ExternalServiceError(provider, `${top} → ${endpoint}${causeBits}`, undefined, {
    cause: err,
  })
}

// 拼 HTTP error 信息时用 — body 读失败是次要的, 不能让"读 body 失败"挡掉"我要告诉
// 上层 HTTP 500"这件事. 截断 500 字符防 OOM/log 风暴
async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text()
    return t.slice(0, 500)
  } catch {
    return '(no body)'
  }
}

// SSE 行格式: `data: {json}` 直到 `data: [DONE]`
// 共享一个 TextDecoder + stream:true, 跨 chunk 的 UTF-8 字节(中文)不会被切断
//
// 返回值: 'continue' | 'done' — 用 yield + 状态机让 complexity 不超 10
async function* parseSseContent(
  body: ReadableStream<Uint8Array>,
  provider: string,
): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      const result = yield* yieldFromLines(lines)
      if (result === 'done') return
    }
    // flush 残余
    buffer += decoder.decode()
    yield* yieldFromLines([buffer])
  } catch (e: unknown) {
    throw new ExternalServiceError(
      provider,
      `stream read failed: ${e instanceof Error ? e.message : String(e)}`,
      undefined,
      { cause: e },
    )
  } finally {
    reader.releaseLock()
  }
}

function* yieldFromLines(lines: readonly string[]): Generator<string, 'continue' | 'done', void> {
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || !trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (payload === '[DONE]') return 'done'
    const parsed = safeParseChunk(payload)
    if (parsed === null) continue
    const delta = parsed.choices[0]?.delta?.content
    if (delta !== undefined && delta.length > 0) yield delta
  }
  return 'continue'
}

// SSE 流里偶尔有半截/坏 chunk (server flush 时机 / 中间代理乱切) — 单 chunk 坏不该
// 把整个 stream abort. 静默丢这条, 后续 chunk 还能继续解析. 流抽完用户也只损失几个 token
function safeParseChunk(s: string): z.infer<typeof streamChunkSchema> | null {
  try {
    const raw: unknown = JSON.parse(s)
    const parsed = streamChunkSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
