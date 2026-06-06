import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createBrain } from './index.js'

// 主人哲学 (2026-06-07): URL 一层, brand 专属 env, 没填就 throw — 不静默走错地方
// brain factory 构造时不 throw (lazy), 第一次 fetch 时 resolver throw, 错误信息直接告诉
// 主人该 set 哪个 env

const baseCfg = {
  openaiApiKey: 'sk-test',
  openaiModel: 'whatever',
  deepseekUrl: undefined,
  ollamaUrl: undefined,
  openaiBaseUrl: undefined,
}

// 通用 stub schema — generateJson 调用 resolver 时同步 throw, 不会真到 schema 这一步
const stubSchema = z.object({ x: z.string() })

describe('createBrain — URL 强制专属 env', () => {
  it('BRAIN_TYPE=deepseek 没 set DEEPSEEK_URL → 调用时 throw (不静默走 openai)', async () => {
    const brain = createBrain('deepseek', baseCfg)
    expect(brain).toBeDefined()
    await expect(brain.generateJson([{ role: 'user', content: 'hi' }], stubSchema)).rejects.toThrow(
      /BRAIN_TYPE=deepseek.*DEEPSEEK_URL/,
    )
  })

  it('BRAIN_TYPE=ollama 没 set OLLAMA_URL → throw', async () => {
    const brain = createBrain('ollama', baseCfg)
    await expect(brain.generateJson([{ role: 'user', content: 'hi' }], stubSchema)).rejects.toThrow(
      /BRAIN_TYPE=ollama.*OLLAMA_URL/,
    )
  })

  it('BRAIN_TYPE=openai-compat 没 set OPENAI_BASE_URL → throw', async () => {
    const brain = createBrain('openai-compat', baseCfg)
    await expect(brain.generateJson([{ role: 'user', content: 'hi' }], stubSchema)).rejects.toThrow(
      /BRAIN_TYPE=openai-compat.*OPENAI_BASE_URL/,
    )
  })

  it('BRAIN_TYPE=deepseek + DEEPSEEK_URL 填了 → 构造成功 (URL 独占在 deepseek 这一层)', () => {
    const brain = createBrain('deepseek', {
      ...baseCfg,
      deepseekUrl: 'https://api.deepseek.com/v1',
      // 故意把 openaiBaseUrl 填别的, 验证 deepseek case 不读它
      openaiBaseUrl: 'https://wrong.example.com/v1',
    })
    expect(brain).toBeDefined()
  })

  it('BRAIN_TYPE=custom 没 customResolver → 构造时 throw', () => {
    expect(() => createBrain('custom', baseCfg)).toThrow(/BRAIN_TYPE=custom.*customResolver/)
  })

  it('BRAIN_TYPE=custom + customResolver → ok', () => {
    const brain = createBrain('custom', {
      ...baseCfg,
      customResolver: () => 'https://my-private-llm.example.com/v1',
    })
    expect(brain).toBeDefined()
  })
})
