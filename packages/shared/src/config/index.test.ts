import { describe, expect, it } from 'vitest'

import { loadEnv } from './index.js'

// PRD-002 (2026-06-XX): env 简化为 AI_URL + AI_KEY + AI_MODEL 三孔
// autoInferDeepseek 触发条件: AI_KEY 已设 + BRAIN_TYPE 未设 → 推 deepseek 默认值

describe('loadEnv autoInferDeepseek', () => {
  it('auto-switches to deepseek when only AI_KEY is set', () => {
    const env = loadEnv({ AI_KEY: 'sk-ds-real' })
    expect(env.BRAIN_TYPE).toBe('deepseek')
    expect(env.AI_KEY).toBe('sk-ds-real')
    expect(env.AI_URL).toBe('https://api.deepseek.com/v1')
    expect(env.AI_MODEL).toBe('deepseek-chat')
  })

  it('treats whitespace-only BRAIN_TYPE as not set (shell 残留 BRAIN_TYPE="   ")', () => {
    const env = loadEnv({
      AI_KEY: 'sk-ds-real',
      BRAIN_TYPE: '   ',
    })
    expect(env.BRAIN_TYPE).toBe('deepseek')
  })

  it('treats empty AI_KEY as not set (no inference)', () => {
    const env = loadEnv({ AI_KEY: '' })
    expect(env.BRAIN_TYPE).toBe('openai-compat') // schema default
    expect(env.AI_URL).toBeUndefined()
  })

  it('respects explicit BRAIN_TYPE (no auto-switch even with AI_KEY)', () => {
    const env = loadEnv({
      AI_KEY: 'sk-openai',
      BRAIN_TYPE: 'openai-compat',
      AI_URL: 'https://api.openai.com/v1',
    })
    expect(env.BRAIN_TYPE).toBe('openai-compat')
    expect(env.AI_KEY).toBe('sk-openai')
    expect(env.AI_URL).toBe('https://api.openai.com/v1')
  })

  it('respects explicit AI_URL even when triggering deepseek auto-infer', () => {
    // 用户用 deepseek 代理 URL (e.g. cloudflare proxy)
    const env = loadEnv({
      AI_KEY: 'sk-real',
      AI_URL: 'https://my-deepseek-proxy.example.com/v1',
    })
    expect(env.BRAIN_TYPE).toBe('deepseek')
    expect(env.AI_URL).toBe('https://my-deepseek-proxy.example.com/v1')
  })

  it('respects explicit AI_MODEL when triggering deepseek auto-infer', () => {
    const env = loadEnv({
      AI_KEY: 'sk-real',
      AI_MODEL: 'deepseek-reasoner',
    })
    expect(env.BRAIN_TYPE).toBe('deepseek')
    expect(env.AI_MODEL).toBe('deepseek-reasoner')
  })

  it('does not infer when neither AI_KEY nor BRAIN_TYPE is set', () => {
    const env = loadEnv({})
    expect(env.BRAIN_TYPE).toBe('openai-compat')
    expect(env.AI_URL).toBeUndefined()
    expect(env.AI_KEY).toBeUndefined()
  })

  it('accepts fully explicit env (e.g. ollama)', () => {
    const env = loadEnv({
      BRAIN_TYPE: 'ollama',
      AI_URL: 'http://localhost:11434/v1',
      AI_KEY: 'fake-ollama-key',
      AI_MODEL: 'qwen2.5:7b',
    })
    expect(env.BRAIN_TYPE).toBe('ollama')
    expect(env.AI_URL).toBe('http://localhost:11434/v1')
    expect(env.AI_KEY).toBe('fake-ollama-key')
    expect(env.AI_MODEL).toBe('qwen2.5:7b')
  })
})
