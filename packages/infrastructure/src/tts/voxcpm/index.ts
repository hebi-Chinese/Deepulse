// TTS · VoxCPM2 客户端 (走 tools/voxcpm-server FastAPI wrapper)
//
// 跟 GPT-SoVITS 形状几乎一样, 差别就两件:
//   1) endpoint 是 /synthesize 不是 /infer_single
//   2) payload 用 voice_design (自然语言描述), 不用 model_name + emotion
//      → 我们把 IBuilt-in emotion 通过前缀拼进 voice_design 让调用方零改动

import { ExternalServiceError } from '@deepulse/domain'
import { request } from 'undici'
import { z } from 'zod'

import type { ITtsClient, TtsSynthesizeRequest, TtsSynthesizeResult } from '@deepulse/application'

// vox 推理时间 cold start 比 sovits 长 (模型 4GB), 第一条留宽; 后续都 < 10s
const HEADERS_TIMEOUT_MS = 60_000
const BODY_TIMEOUT_MS = 60_000

// FastAPI wrapper 响应契约 — 跟 gpt-sovits audio_url 字段名故意一致
const synthesizeResponseSchema = z.object({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- python snake_case
  audio_url: z.string().min(1),
})

// emotion → 中文前缀, 拼进 voice_design 让 vox 自己渲染情绪
// 不在 server 端处理是因为 server 应只做 model 翻译, 不知道 Deepulse 的 emotion enum
// 只列正面 + 中性, 跟 port TTS_EMOTIONS 对齐 (负面情绪产品上不做)
const EMOTION_HINTS: Record<string, string> = {
  开心: '语气开心明亮',
  中立: '语气平稳',
}

export class VoxCpmTtsClient implements ITtsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly voiceDesign: string,
  ) {}

  async synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    const emotionHint = EMOTION_HINTS[req.emotion] ?? ''
    const fullVoiceDesign =
      emotionHint.length > 0 ? `${this.voiceDesign}, ${emotionHint}` : this.voiceDesign
    /* eslint-disable @typescript-eslint/naming-convention -- voxcpm-server API 字段 */
    const payload = {
      text: req.text,
      voice_design: fullVoiceDesign,
    }
    /* eslint-enable @typescript-eslint/naming-convention */

    const url = `${this.baseUrl.replace(/\/$/, '')}/synthesize`
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
        'voxcpm',
        `HTTP ${String(res.statusCode)}: ${body.slice(0, 200)}`,
        res.statusCode,
      )
    }

    const json: unknown = await res.body.json()
    const parsed = synthesizeResponseSchema.safeParse(json)
    if (!parsed.success) {
      throw new ExternalServiceError('voxcpm', `response shape invalid: ${parsed.error.message}`)
    }

    return { audioUrl: rewriteHost(parsed.data.audio_url) }
  }
}

// 跟 gpt-sovits 同源 — server 默认绑 127.0.0.1 时 url 不变, 真要绑 0.0.0.0
// 浏览器无法解析, 统一改 127.0.0.1
function rewriteHost(audioUrl: string): string {
  return audioUrl.replace('://0.0.0.0', '://127.0.0.1')
}
