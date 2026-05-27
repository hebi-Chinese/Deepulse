// TTS · GPT-SoVITS :8000 客户端
// 流萤声线 + 中文专用 + emotion 5 选 1
// 服务端默认返回 0.0.0.0 host 的 URL → 替换成 127.0.0.1 (前端浏览器才能放)

import { ExternalServiceError } from '@claudio/shared'
import { request } from 'undici'
import { z } from 'zod'

import type { ITtsClient, TtsSynthesizeRequest, TtsSynthesizeResult } from '@claudio/application'

const DEFAULT_MODEL = '星穹铁道-中文-流萤'
const DEFAULT_VERSION = 'v4'
const DEFAULT_LANG = '中文'
// undici 默认 headers/body 各 300s,SoVITS 卡死会拖死 /api/dj/say 5 分钟。
// 合成 < 10s 是正常水平,留 30s 上限给 cold-start
const HEADERS_TIMEOUT_MS = 30_000
const BODY_TIMEOUT_MS = 30_000

// gpt-sovits /infer_single 响应契约(只取我们关心的字段)
const inferResponseSchema = z.object({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- gpt-sovits 返回字段
  audio_url: z.string().min(1),
})

export class GptSovitsTtsClient implements ITtsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly modelName: string = DEFAULT_MODEL,
  ) {}

  async synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    /* eslint-disable @typescript-eslint/naming-convention -- gpt-sovits API 字段 */
    const payload = {
      version: DEFAULT_VERSION,
      model_name: this.modelName,
      emotion: req.emotion,
      text: req.text,
      text_lang: DEFAULT_LANG,
      prompt_text_lang: DEFAULT_LANG,
      media_type: 'wav',
    }
    /* eslint-enable @typescript-eslint/naming-convention */

    const url = `${this.baseUrl.replace(/\/$/, '')}/infer_single`
    const res = await request(url, {
      method: 'POST',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      headersTimeout: HEADERS_TIMEOUT_MS,
      bodyTimeout: BODY_TIMEOUT_MS,
    })

    if (res.statusCode < 200 || res.statusCode >= 300) {
      const body = await res.body.text()
      throw new ExternalServiceError(
        'gpt-sovits',
        `HTTP ${String(res.statusCode)}: ${body.slice(0, 200)}`,
        res.statusCode,
      )
    }

    const json: unknown = await res.body.json()
    const parsed = inferResponseSchema.safeParse(json)
    if (!parsed.success) {
      throw new ExternalServiceError(
        'gpt-sovits',
        `response shape invalid: ${parsed.error.message}`,
      )
    }

    return { audioUrl: rewriteHost(parsed.data.audio_url) }
  }
}

// 服务端返回 http://0.0.0.0:8000/outputs/xxx.wav,浏览器无法解析 0.0.0.0
// 统一替换为 127.0.0.1 (与 baseUrl 同源,前端可直接 fetch)
function rewriteHost(audioUrl: string): string {
  return audioUrl.replace('://0.0.0.0', '://127.0.0.1')
}
