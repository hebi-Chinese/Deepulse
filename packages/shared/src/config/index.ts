// env 校验：所有 env var 必须在这里声明 + zod 校验，不允许 process.env.X 散落
// 用法：import { loadEnv } from '@claudio/shared/config'

import { z } from 'zod'

// 自动探测: env 里只有 DEEPSEEK_API_KEY 但 BRAIN_TYPE / OPENAI_* 都没**实质**给时,
// 推断用户想走 deepseek. 让 fork 者不必必须走 claudio.bat 也能跑 — 直接 export
// DEEPSEEK_API_KEY 然后 pnpm dev 即可
//
// "实质" 的关键: 空字符串 / 仅空白 也当 "没给". 用户 shell 经常会有
// `export OPENAI_API_KEY=""` 这种残留, 不能让那种把 auto-detect 顶掉.
//
// 注: URL 不再由 autoInfer 负责 — brain factory 各 case 直接读 DEEPSEEK_URL 等
// 专属 env. 用户哲学: brand 专属 URL, 不预填 default.
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

// 30 min — 用户离开/挂机超过这个 → session 边界, 下次回来 DJ 不接上次话头
const DEFAULT_SESSION_IDLE_MS = 30 * 60 * 1000

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // 端口（PRD §5.4）
  SERVER_PORT: z.coerce.number().int().positive().default(8787),
  PWA_PORT: z.coerce.number().int().positive().default(3000),
  NCM_PORT: z.coerce.number().int().positive().default(3001),
  TTS_URL: z.string().url().default('http://127.0.0.1:8000'),

  // TTS 实现选择 — mock 默认让 fork 者首次 demo 不卡 (返回静音 wav, UI 全 ok)
  //   gpt-sovits : 用户本地, 流萤声线 (需起 GPT-SoVITS server :8000)
  //   voxcpm     : OpenBMB VoxCPM2, voice design 自然语言描声 (需起 tools/voxcpm-server :8001)
  TTS_TYPE: z.enum(['mock', 'gpt-sovits', 'voxcpm']).default('mock'),

  // VoxCPM (TTS_TYPE=voxcpm 时必填) — 没 set startup throw, 不静默走错地方
  VOXCPM_URL: z.string().url().optional(),
  // VoxCPM voice design 自然语言描述声音 (性别/年龄/情绪/语速); 默认温柔女声
  VOXCPM_VOICE_DESIGN: z.string().default('温柔女声, 25 岁, 中性情绪, 语速适中'),

  // Brain（PRD §10 Q5）
  // 默认 openai-compat — fork 者拿到 repo 后改 BRAIN_TYPE + 配对应 *_URL + *_API_KEY 就能跑
  // 用户想用 claude CLI 走 BRAIN_TYPE=claude 显式打开
  BRAIN_TYPE: z
    .enum(['claude', 'deepseek', 'ollama', 'openai-compat', 'custom'])
    .default('openai-compat'),

  // OpenAI-Compatible Brain · BYO LLM
  // 用户哲学 (2026-06-07): 每 brand 一个专属 URL env, 不预填 default. factory 在 brain.ts
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

  // 用户手写的喜好 markdown 目录 (apps/server/data/user-prefs)
  // 默认相对源文件解析, 可用 env 覆盖 (e.g. 多人测试 / Docker 挂载)
  USER_PREFS_DIR: z.string().optional(),

  // ─── DJ 记忆系统 ───
  // 短期记忆 (session) Redis 连接串; 不给 → 走内存版 (单进程 fallback)
  REDIS_URL: z.string().optional(),
  // session idle 超时 (ms); 默认 30 min, 用户这段时间没说话 → 新 session
  SESSION_IDLE_MS: z.coerce.number().int().positive().default(DEFAULT_SESSION_IDLE_MS),
  // 长期记忆 distill markdown 文件路径; 默认 apps/server/data/dj-long-term.md
  LONG_TERM_PATH: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(autoInferDeepseek(source))
}
