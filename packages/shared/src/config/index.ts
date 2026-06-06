// env 校验：所有 env var 必须在这里声明 + zod 校验，不允许 process.env.X 散落
// 用法：import { loadEnv } from '@claudio/shared/config'

import { z } from 'zod'

// 自动探测: env 里只有 DEEPSEEK_API_KEY 但 BRAIN_TYPE / OPENAI_* 都没**实质**给时,
// 推断主人想走 deepseek. 让 fork 者不必必须走 claudio.bat 也能跑 — 直接 export
// DEEPSEEK_API_KEY 然后 pnpm dev 即可
//
// "实质" 的关键: 空字符串 / 仅空白 也当 "没给". 主人 shell 经常会有
// `export OPENAI_API_KEY=""` 这种残留, 不能让那种把 auto-detect 顶掉.
//
// 注: URL 不再由 autoInfer 负责 — brain factory 各 case 直接读 DEEPSEEK_URL 等
// 专属 env. 主人哲学: brand 专属 URL, 不预填 default.
function autoInferDeepseek(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (isBlank(source['DEEPSEEK_API_KEY'])) return source
  if (!isBlank(source['BRAIN_TYPE'])) return source
  if (!isBlank(source['OPENAI_API_KEY'])) return source
  return {
    ...source,
    BRAIN_TYPE: 'deepseek',
    OPENAI_API_KEY: source['DEEPSEEK_API_KEY'],
    OPENAI_MODEL: isBlank(source['OPENAI_MODEL']) ? 'deepseek-chat' : source['OPENAI_MODEL'],
  }
}

function isBlank(s: string | undefined): boolean {
  return s === undefined || s.trim().length === 0
}

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
  // 默认 openai-compat — fork 者拿到 repo 后改 BRAIN_TYPE + 配对应 *_URL + *_API_KEY 就能跑
  // 主人想用 claude CLI 走 BRAIN_TYPE=claude 显式打开
  BRAIN_TYPE: z
    .enum(['claude', 'deepseek', 'ollama', 'openai-compat', 'custom'])
    .default('openai-compat'),

  // OpenAI-Compatible Brain · BYO LLM
  // 主人哲学 (2026-06-07): 每 brand 一个专属 URL env, 不预填 default. factory 在 brain.ts
  // 里各 case 检查对应字段, 没设就 startup throw — 不静默走错地方.
  //   BRAIN_TYPE=deepseek      需 set DEEPSEEK_URL (e.g. https://api.deepseek.com/v1)
  //   BRAIN_TYPE=ollama        需 set OLLAMA_URL (e.g. http://localhost:11434/v1)
  //   BRAIN_TYPE=openai-compat 需 set OPENAI_BASE_URL (官方 / 自部署 / 任何 OpenAI-compatible)
  DEEPSEEK_URL: z.string().url().optional(),
  OLLAMA_URL: z.string().url().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
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

  // ─── DJ 记忆系统 ───
  // 短期记忆 (session) Redis 连接串; 不给 → 走内存版 (单进程 fallback)
  REDIS_URL: z.string().optional(),
  // session idle 超时 (ms); 默认 30 min, 主人这段时间没说话 → 新 session
  SESSION_IDLE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60 * 1000),
  // 长期记忆 distill markdown 文件路径; 默认 apps/server/data/dj-long-term.md
  LONG_TERM_PATH: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(autoInferDeepseek(source))
}
