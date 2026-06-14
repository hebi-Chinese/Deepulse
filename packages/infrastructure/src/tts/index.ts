// TTS 工厂 · 根据 TTS_TYPE env 选实现
//
// 现有实现:
//   - gpt-sovits : 用户本地 GPT-SoVITS server (中文专用, 需要 GPU + 部署)
//   - mock       : 默认, 返回静音 wav, fork 者首次跑能完整 demo UI 不报错
//   - voxcpm     : OpenBMB VoxCPM2, 30 语言 + voice design (自然语言描述声音);
//                  需要先起 tools/voxcpm-server (Python FastAPI wrapper)
//
// 加新 TTS provider:
//   1. 本目录新建子目录 + 实现 ITtsClient (synthesize 一个方法)
//   2. 这里注册 createTts 分支
//   3. shared/config 的 TTS_TYPE enum 加新枚举

import { GptSovitsTtsClient } from './gpt-sovits/index.js'
import { MockTtsClient } from './mock/index.js'
import { VoxCpmTtsClient } from './voxcpm/index.js'

import type { ITtsClient } from '@deepulse/application'

export type TtsType = 'gpt-sovits' | 'mock' | 'voxcpm'

export type TtsFactoryConfig = {
  readonly ttsUrl: string
  readonly voxcpmUrl: string | undefined
  readonly voxcpmVoiceDesign: string
  readonly logger?: { readonly warn: (msg: string) => void }
}

export function createTts(type: TtsType, config: TtsFactoryConfig): ITtsClient {
  switch (type) {
    case 'gpt-sovits':
      return new GptSovitsTtsClient(config.ttsUrl)
    case 'mock':
      return config.logger !== undefined ? new MockTtsClient(config.logger) : new MockTtsClient()
    case 'voxcpm': {
      // brain 同款"专属 URL, 不预填"哲学 — 没 set 直接抛, 不静默走错地方
      if (config.voxcpmUrl === undefined || config.voxcpmUrl.trim().length === 0) {
        throw new Error(
          'TTS_TYPE=voxcpm 必须 set VOXCPM_URL env (e.g. http://127.0.0.1:8001, 先起 tools/voxcpm-server)',
        )
      }
      return new VoxCpmTtsClient(config.voxcpmUrl, config.voxcpmVoiceDesign)
    }
    default: {
      const _exhaustive: never = type
      throw new Error(`unknown TTS type: ${_exhaustive as string}`)
    }
  }
}

export { GptSovitsTtsClient } from './gpt-sovits/index.js'
export { MockTtsClient } from './mock/index.js'
export { VoxCpmTtsClient } from './voxcpm/index.js'
