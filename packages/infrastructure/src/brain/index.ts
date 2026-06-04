// Brain 工厂 · BYO LLM 入口, 根据 BRAIN_TYPE env 选实现
// 加新 brain: 新建子目录 + 实现 IBrain + 在这里注册
//
// 现有实现:
//   - claude         : 主人本地用, ClaudeCodeBrain 包装 claude CLI 子进程 (不推荐他人复用, 需要 Pro 订阅)
//   - openai-compat  : 通用入口, 走 OpenAI /v1/chat/completions, 配 base_url + model + api_key
//   - deepseek       : 走 openai-compat, 默认 base_url = api.deepseek.com/v1
//   - ollama         : 走 openai-compat, 默认 base_url = localhost:11434/v1
//   - custom         : 占位, 用户在 fork 里自行替换实现

import { ClaudeCodeBrain } from './claude/index.js'
import { OpenAICompatBrain } from './openai-compat/index.js'

import type { IBrain } from '@claudio/application'

export type BrainType = 'claude' | 'deepseek' | 'ollama' | 'openai-compat' | 'custom'

export type BrainFactoryConfig = {
  readonly openaiBaseUrl: string
  readonly openaiApiKey: string | undefined
  readonly openaiModel: string
}

// 各 provider 的默认 base_url — 用户没显式配 OPENAI_BASE_URL 时按 BRAIN_TYPE 推断
const PROVIDER_DEFAULT_BASE_URL: Readonly<Record<string, string>> = {
  deepseek: 'https://api.deepseek.com/v1',
  ollama: 'http://localhost:11434/v1',
}

export function createBrain(type: BrainType, config: BrainFactoryConfig): IBrain {
  switch (type) {
    case 'claude':
      return new ClaudeCodeBrain()
    case 'openai-compat':
    case 'deepseek':
    case 'ollama': {
      // 用户没显式给 OPENAI_BASE_URL (= 仍是默认 api.openai.com) 且 BRAIN_TYPE 是别的 provider,
      // 则用该 provider 的标准默认 base_url
      const isDefaultUrl = config.openaiBaseUrl === 'https://api.openai.com/v1'
      const providerDefault = PROVIDER_DEFAULT_BASE_URL[type]
      const baseUrl =
        isDefaultUrl && providerDefault !== undefined ? providerDefault : config.openaiBaseUrl
      return new OpenAICompatBrain({
        baseUrl,
        apiKey: config.openaiApiKey,
        model: config.openaiModel,
        providerLabel: type,
      })
    }
    case 'custom':
      throw new Error(
        'brain type "custom" requires fork-level implementation; see infrastructure/brain/README.md',
      )
    default: {
      const _exhaustive: never = type
      throw new Error(`unknown brain type: ${_exhaustive as string}`)
    }
  }
}

export { ClaudeCodeBrain } from './claude/index.js'
export { OpenAICompatBrain } from './openai-compat/index.js'
export type { OpenAICompatConfig } from './openai-compat/index.js'
