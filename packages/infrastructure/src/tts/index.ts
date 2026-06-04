// TTS 工厂 · 根据 TTS_TYPE env 选实现
//
// 现有实现:
//   - gpt-sovits : 主人本地 GPT-SoVITS server (流萤声线, 需要 GPU + 部署)
//   - mock       : 默认, 返回静音 wav, fork 者首次跑能完整 demo UI 不报错
//   - voxcpm     : 占位, 用户自行 fork 实现 — 见 ./README.md
//
// 加新 TTS provider:
//   1. 本目录新建子目录 + 实现 ITtsClient (synthesize 一个方法)
//   2. 这里注册 createTts 分支
//   3. shared/config 的 TTS_TYPE enum 加新枚举

import { GptSovitsTtsClient } from './gpt-sovits/index.js'
import { MockTtsClient } from './mock/index.js'

import type { ITtsClient } from '@claudio/application'

export type TtsType = 'gpt-sovits' | 'mock' | 'voxcpm'

export type TtsFactoryConfig = {
  readonly ttsUrl: string
  readonly logger?: { readonly warn: (msg: string) => void }
}

export function createTts(type: TtsType, config: TtsFactoryConfig): ITtsClient {
  switch (type) {
    case 'gpt-sovits':
      return new GptSovitsTtsClient(config.ttsUrl)
    case 'mock':
      return config.logger !== undefined ? new MockTtsClient(config.logger) : new MockTtsClient()
    case 'voxcpm':
      throw new Error(
        'TTS type "voxcpm" not bundled — see infrastructure/src/tts/README.md for steps to add it',
      )
    default: {
      const _exhaustive: never = type
      throw new Error(`unknown TTS type: ${_exhaustive as string}`)
    }
  }
}

export { GptSovitsTtsClient } from './gpt-sovits/index.js'
export { MockTtsClient } from './mock/index.js'
