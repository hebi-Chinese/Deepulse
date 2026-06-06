import { describe, expect, it } from 'vitest'

import { loadEnv } from './index.js'

// autoInferDeepseek 的边界 case: 空字符串/全空白/未定义都应当当作"没给", 让 auto-detect 接管.
// 主人哲学 (2026-06-07): URL 一层, brand 专属 env var, autoInfer 只 set BRAIN_TYPE + API_KEY 映射,
// URL 让 brain factory 各 case 检查对应 *_URL env 自己 throw.

describe('loadEnv autoInferDeepseek', () => {
  it('auto-switches to deepseek when only DEEPSEEK_API_KEY is set', () => {
    const env = loadEnv({ DEEPSEEK_API_KEY: 'sk-ds-real' })
    expect(env.BRAIN_TYPE).toBe('deepseek')
    expect(env.OPENAI_API_KEY).toBe('sk-ds-real')
    expect(env.OPENAI_MODEL).toBe('deepseek-chat')
    // URL 不再由 autoInfer 设, brain factory 自己读 DEEPSEEK_URL
    expect(env.DEEPSEEK_URL).toBeUndefined()
    expect(env.OPENAI_BASE_URL).toBeUndefined()
  })

  it('treats empty OPENAI_API_KEY as not set (shell 残留 OPENAI_API_KEY="")', () => {
    const env = loadEnv({
      DEEPSEEK_API_KEY: 'sk-ds-real',
      OPENAI_API_KEY: '',
    })
    expect(env.BRAIN_TYPE).toBe('deepseek')
    expect(env.OPENAI_API_KEY).toBe('sk-ds-real')
  })

  it('treats whitespace-only BRAIN_TYPE as not set', () => {
    const env = loadEnv({
      DEEPSEEK_API_KEY: 'sk-ds-real',
      BRAIN_TYPE: '   ',
    })
    expect(env.BRAIN_TYPE).toBe('deepseek')
  })

  it('respects explicit BRAIN_TYPE=openai-compat (no auto-switch)', () => {
    const env = loadEnv({
      DEEPSEEK_API_KEY: 'sk-ds',
      BRAIN_TYPE: 'openai-compat',
      OPENAI_API_KEY: 'sk-openai-real',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
    })
    expect(env.BRAIN_TYPE).toBe('openai-compat')
    expect(env.OPENAI_API_KEY).toBe('sk-openai-real')
    expect(env.OPENAI_BASE_URL).toBe('https://api.openai.com/v1')
  })

  it('does not infer when DEEPSEEK_API_KEY is empty', () => {
    const env = loadEnv({ DEEPSEEK_API_KEY: '' })
    expect(env.BRAIN_TYPE).toBe('openai-compat')
    expect(env.OPENAI_BASE_URL).toBeUndefined() // 没 default 了
  })

  it('does not infer when neither key is set', () => {
    const env = loadEnv({})
    expect(env.BRAIN_TYPE).toBe('openai-compat')
    expect(env.DEEPSEEK_URL).toBeUndefined()
    expect(env.OLLAMA_URL).toBeUndefined()
    expect(env.OPENAI_BASE_URL).toBeUndefined()
  })

  // 新增: 锁定"brand 专属 URL env" 模式 — 三个 URL var 各自独立
  it('accepts brand-exclusive URL envs (DEEPSEEK_URL / OLLAMA_URL / OPENAI_BASE_URL)', () => {
    const env = loadEnv({
      BRAIN_TYPE: 'deepseek',
      OPENAI_API_KEY: 'sk-real',
      DEEPSEEK_URL: 'https://api.deepseek.com/v1',
      OLLAMA_URL: 'http://localhost:11434/v1',
      OPENAI_BASE_URL: 'https://x.example.com/v1',
    })
    expect(env.DEEPSEEK_URL).toBe('https://api.deepseek.com/v1')
    expect(env.OLLAMA_URL).toBe('http://localhost:11434/v1')
    expect(env.OPENAI_BASE_URL).toBe('https://x.example.com/v1')
  })
})
