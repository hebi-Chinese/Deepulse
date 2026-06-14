// Brain 工厂 · BYO LLM 入口, 根据 BRAIN_TYPE env 选实现
// 加新 brain: 新建子目录 + 实现 IBrain + 在这里注册
//
// 用户哲学 (PRD-002, 2026-06-XX): AI_URL + AI_KEY + AI_MODEL 通用三孔
//   - claude        : 用户本地 Claude CLI 子进程 (不读 AI_*)
//   - deepseek      : 读 AI_URL, 没设就 throw — 真要用就显式 set, 不静默走错地方
//   - ollama        : 同上
//   - openai-compat : 同上
//   - custom        : composition root 自塞 customResolver 函数
//
// (旧设计每个 brand 各一个专属 URL env 已废, 见 PRD-002)

import { ClaudeCodeBrain } from './claude/index.js'
import { OpenAICompatBrain } from './openai-compat/index.js'

import type { IBrain } from '@deepulse/application'

export type BrainType = 'claude' | 'deepseek' | 'ollama' | 'openai-compat' | 'custom'

export type BrainFactoryConfig = {
  /** 通用 AI endpoint URL — 所有非 claude brand 共用 */
  readonly aiUrl: string | undefined
  /** 通用 API key */
  readonly aiKey: string | undefined
  /** 通用 model name (e.g. deepseek-chat / qwen2.5:7b / gpt-4o-mini) */
  readonly aiModel: string

  /** BRAIN_TYPE=custom 时必填: composition root 注入的 URL 解析函数 */
  readonly customResolver?: () => string
}

export function createBrain(type: BrainType, config: BrainFactoryConfig): IBrain {
  switch (type) {
    case 'claude':
      return new ClaudeCodeBrain()

    case 'deepseek':
    case 'ollama':
    case 'openai-compat':
      return new OpenAICompatBrain({
        resolveEndpoint: requiredEnvResolver(type, config.aiUrl),
        apiKey: config.aiKey,
        model: config.aiModel,
        providerLabel: type,
      })

    case 'custom':
      if (config.customResolver === undefined) {
        throw new Error(
          'BRAIN_TYPE=custom 需要 composition root 在 BrainFactoryConfig.customResolver 塞 URL 解析函数; 详见 infrastructure/brain/README.md',
        )
      }
      return new OpenAICompatBrain({
        resolveEndpoint: config.customResolver,
        apiKey: config.aiKey,
        model: config.aiModel,
        providerLabel: 'custom',
      })

    default: {
      const _exhaustive: never = type
      throw new Error(`unknown brain type: ${_exhaustive as string}`)
    }
  }
}

// 构造 resolver: 闭包持值, 第一次调用时才检查 (lazy) — 让构造 brain 实例不抛, 调用时抛
// 抛错信息直接告诉用户该 set 哪个 env var, 不是 "fetch failed" 之类间接的
function requiredEnvResolver(brainType: string, value: string | undefined): () => string {
  return () => {
    if (value === undefined || value.trim().length === 0) {
      throw new Error(`BRAIN_TYPE=${brainType} 必须 set AI_URL env (e.g. 在 deepulse.bat 里)`)
    }
    return value
  }
}

export { ClaudeCodeBrain } from './claude/index.js'
export { OpenAICompatBrain } from './openai-compat/index.js'
export type { OpenAICompatConfig } from './openai-compat/index.js'
