import { describe, expect, it } from 'vitest'

import { loadEnv } from './index.js'

// autoInferDeepseek 的边界 case: 空字符串/全空白/未定义都应当当作"没给", 让 auto-detect 接管
// 锁定的原因: 主人 shell 经常残留 `export OPENAI_API_KEY=""`, 不能让那种把
// auto-detect 顶掉 → 进而打到 api.openai.com 触发 ConnectTimeout

describe('loadEnv autoInferDeepseek', () => {
  it('auto-switches to deepseek when only DEEPSEEK_API_KEY is set', () => {
    const env = loadEnv({ DEEPSEEK_API_KEY: 'sk-ds-real' })
    expect(env.BRAIN_TYPE).toBe('deepseek')
    expect(env.OPENAI_BASE_URL).toBe('https://api.deepseek.com/v1')
    expect(env.OPENAI_API_KEY).toBe('sk-ds-real')
    expect(env.OPENAI_MODEL).toBe('deepseek-chat')
  })

  it('treats empty OPENAI_API_KEY as not set (shell 残留 OPENAI_API_KEY="")', () => {
    const env = loadEnv({
      DEEPSEEK_API_KEY: 'sk-ds-real',
      OPENAI_API_KEY: '',
    })
    expect(env.BRAIN_TYPE).toBe('deepseek')
    expect(env.OPENAI_BASE_URL).toBe('https://api.deepseek.com/v1')
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
    })
    expect(env.BRAIN_TYPE).toBe('openai-compat')
    expect(env.OPENAI_API_KEY).toBe('sk-openai-real')
    expect(env.OPENAI_BASE_URL).toBe('https://api.openai.com/v1')
  })

  it('does not infer when DEEPSEEK_API_KEY is empty', () => {
    const env = loadEnv({ DEEPSEEK_API_KEY: '' })
    expect(env.BRAIN_TYPE).toBe('openai-compat')
    expect(env.OPENAI_BASE_URL).toBe('https://api.openai.com/v1')
  })

  it('does not infer when neither key is set', () => {
    const env = loadEnv({})
    expect(env.BRAIN_TYPE).toBe('openai-compat')
  })
})
