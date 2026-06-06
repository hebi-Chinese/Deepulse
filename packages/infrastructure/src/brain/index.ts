// Brain 工厂 · BYO LLM 入口, 根据 BRAIN_TYPE env 选实现
// 加新 brain: 新建子目录 + 实现 IBrain + 在这里注册
//
// 主人哲学 (2026-06-07): URL 一层, brand 专属 env var, factory 不预填 default.
//   - deepseek      : 读 DEEPSEEK_URL, 没设就 throw — 真要用就显式 set, 不静默走错地方
//   - ollama        : 读 OLLAMA_URL, 没设就 throw
//   - openai-compat : 读 OPENAI_BASE_URL, 没设就 throw
//   - custom        : composition root 自塞 customResolver 函数
//
// 现有实现:
//   - claude        : 主人本地用, ClaudeCodeBrain 包装 claude CLI 子进程 (不推荐他人复用, 需要 Pro 订阅)
//   - 其它走 OpenAICompatBrain (OpenAI /v1/chat/completions 协议)

import { ClaudeCodeBrain } from './claude/index.js'
import { OpenAICompatBrain } from './openai-compat/index.js'

import type { IBrain } from '@claudio/application'

export type BrainType = 'claude' | 'deepseek' | 'ollama' | 'openai-compat' | 'custom'

export type BrainFactoryConfig = {
  /** 各 brand 的专属 URL env (任一可空, 由对应 case 自己检查) */
  readonly deepseekUrl: string | undefined
  readonly ollamaUrl: string | undefined
  readonly openaiBaseUrl: string | undefined

  readonly openaiApiKey: string | undefined
  readonly openaiModel: string

  /** BRAIN_TYPE=custom 时必填: composition root 注入的 URL 解析函数 */
  readonly customResolver?: () => string
}

export function createBrain(type: BrainType, config: BrainFactoryConfig): IBrain {
  switch (type) {
    case 'claude':
      return new ClaudeCodeBrain()

    case 'deepseek':
      return new OpenAICompatBrain({
        resolveEndpoint: requiredEnvResolver('deepseek', 'DEEPSEEK_URL', config.deepseekUrl),
        apiKey: config.openaiApiKey,
        model: config.openaiModel,
        providerLabel: 'deepseek',
      })

    case 'ollama':
      return new OpenAICompatBrain({
        resolveEndpoint: requiredEnvResolver('ollama', 'OLLAMA_URL', config.ollamaUrl),
        apiKey: config.openaiApiKey,
        model: config.openaiModel,
        providerLabel: 'ollama',
      })

    case 'openai-compat':
      return new OpenAICompatBrain({
        resolveEndpoint: requiredEnvResolver(
          'openai-compat',
          'OPENAI_BASE_URL',
          config.openaiBaseUrl,
        ),
        apiKey: config.openaiApiKey,
        model: config.openaiModel,
        providerLabel: 'openai-compat',
      })

    case 'custom':
      if (config.customResolver === undefined) {
        throw new Error(
          'BRAIN_TYPE=custom 需要 composition root 在 BrainFactoryConfig.customResolver 塞 URL 解析函数; 详见 infrastructure/brain/README.md',
        )
      }
      return new OpenAICompatBrain({
        resolveEndpoint: config.customResolver,
        apiKey: config.openaiApiKey,
        model: config.openaiModel,
        providerLabel: 'custom',
      })

    default: {
      const _exhaustive: never = type
      throw new Error(`unknown brain type: ${_exhaustive as string}`)
    }
  }
}

// 构造 resolver: 闭包持值, 第一次调用时才检查 (lazy) — 让构造 brain 实例不抛, 调用时抛
// 抛错信息直接告诉主人该 set 哪个 env var, 不是 "fetch failed" 之类间接的
function requiredEnvResolver(
  brainType: string,
  envName: string,
  value: string | undefined,
): () => string {
  return () => {
    if (value === undefined || value.trim().length === 0) {
      throw new Error(`BRAIN_TYPE=${brainType} 必须 set ${envName} env (e.g. 在 claudio.bat 里)`)
    }
    return value
  }
}

export { ClaudeCodeBrain } from './claude/index.js'
export { OpenAICompatBrain } from './openai-compat/index.js'
export type { OpenAICompatConfig } from './openai-compat/index.js'
