// TTS · GPT-SoVITS :8000 客户端 (中文专用)
// 服务端默认返回 0.0.0.0 host 的 URL → 替换成 127.0.0.1 (前端浏览器才能放)

import { ExternalServiceError } from '@deepulse/domain'
import { request } from 'undici'
import { z } from 'zod'

import type { ITtsClient, TtsSynthesizeRequest, TtsSynthesizeResult } from '@deepulse/application'

// fork 者本地 GPT-SoVITS server 上的 model id, 必须按自己的替换 (走 modelName 构造参数)
const DEFAULT_MODEL = 'your-sovits-model-id'
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
