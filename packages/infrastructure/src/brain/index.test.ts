import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createBrain } from './index.js'

// PRD-002 (2026-06-XX): AI_URL + AI_KEY + AI_MODEL 通用三孔
// brain factory 构造时不 throw (lazy), 第一次 fetch 时 resolver throw, 错误信息直接
// 告诉用户该 set 哪个 env (AI_URL)

const baseCfg = {
  aiUrl: undefined,
  aiKey: 'sk-test',
  aiModel: 'whatever',
}

// 通用 stub schema — generateJson 调用 resolver 时同步 throw, 不会真到 schema 这一步
const stubSchema = z.object({ x: z.string() })

describe('createBrain — AI_URL 通用孔位', () => {
  it('BRAIN_TYPE=deepseek 没 set AI_URL → 调用时 throw (不静默走错)', async () => {
    const brain = createBrain('deepseek', baseCfg)
    expect(brain).toBeDefined()
    await expect(brain.generateJson([{ role: 'user', content: 'hi' }], stubSchema)).rejects.toThrow(
      /BRAIN_TYPE=deepseek.*AI_URL/,
    )
  })

  it('BRAIN_TYPE=ollama 没 set AI_URL → throw', async () => {
    const brain = createBrain('ollama', baseCfg)
    await expect(brain.generateJson([{ role: 'user', content: 'hi' }], stubSchema)).rejects.toThrow(
      /BRAIN_TYPE=ollama.*AI_URL/,
    )
  })

  it('BRAIN_TYPE=openai-compat 没 set AI_URL → throw', async () => {
    const brain = createBrain('openai-compat', baseCfg)
    await expect(brain.generateJson([{ role: 'user', content: 'hi' }], stubSchema)).rejects.toThrow(
      /BRAIN_TYPE=openai-compat.*AI_URL/,
    )
  })

  it('BRAIN_TYPE=deepseek + AI_URL 填了 → 构造成功', () => {
    const brain = createBrain('deepseek', {
      ...baseCfg,
      aiUrl: 'https://api.deepseek.com/v1',
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
