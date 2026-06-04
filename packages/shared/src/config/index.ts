// env 校验：所有 env var 必须在这里声明 + zod 校验，不允许 process.env.X 散落
// 用法：import { loadEnv } from '@claudio/shared/config'

import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // 端口（PRD §5.4）
  SERVER_PORT: z.coerce.number().int().positive().default(8787),
  PWA_PORT: z.coerce.number().int().positive().default(3000),
  NCM_PORT: z.coerce.number().int().positive().default(3001),
  TTS_URL: z.string().url().default('http://127.0.0.1:8000'),

  // TTS 实现选择 — mock 默认让 fork 者首次 demo 不卡 (返回静音 wav, UI 全 ok)
  // 想要真声音: gpt-sovits (需起 GPT-SoVITS server) / voxcpm (需自行实现 adapter)
  TTS_TYPE: z.enum(['mock', 'gpt-sovits', 'voxcpm']).default('mock'),

  // Brain（PRD §10 Q5）
  BRAIN_TYPE: z.enum(['claude', 'deepseek', 'ollama', 'openai-compat', 'custom']).default('claude'),

  // OpenAI-Compatible Brain · BYO LLM (DeepSeek / Ollama / vLLM / LMStudio / OpenRouter / OpenAI 本身 ...)
  // 任何说自己 "OpenAI-compatible" 的 /v1/chat/completions 服务都能用,
  // BRAIN_TYPE=openai-compat | deepseek | ollama 都走这套实现, 区别只在默认 base_url
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // 数据库
  DATABASE_URL: z.string().default('./data/claudio.db'),

  // 网易云（可选 cookie；不传则只能播放无版权限制的歌）
  NCM_COOKIE: z.string().optional(),

  // drizzle 迁移目录 — dev 走源码路径,prod build 必须显式注入
  // (默认值是从 dist 出发的 src 相对路径,仅 dev 时有意义)
  MIGRATIONS_DIR: z.string().optional(),

  // 主人手写的喜好 markdown 目录 (apps/server/data/user-prefs)
  // 默认相对源文件解析, 可用 env 覆盖 (e.g. 多人测试 / Docker 挂载)
  USER_PREFS_DIR: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source)
}
