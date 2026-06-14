// env 校验：所有 env var 必须在这里声明 + zod 校验，不允许 process.env.X 散落
// 用法：import { loadEnv } from '@deepulse/shared/config'

import { z } from 'zod'

// 自动探测: 用户 set 了 AI_KEY 但没 set BRAIN_TYPE → 默认走 deepseek
// (deepseek 是 Deepulse 默认 brand, 见 memory project-two-form-plan)
//
// 触发条件: BRAIN_TYPE 空 + AI_KEY 已设
// 推断: BRAIN_TYPE=deepseek + AI_URL=https://api.deepseek.com/v1 (若未设) + AI_MODEL=deepseek-chat (若未设)
//
// "已设" 的关键: 空字符串 / 仅空白 也当"没给". 用户 shell 经常会有
// `export AI_KEY=""` 这种残留, 不能让那种把 auto-detect 顶掉.
function autoInferDeepseek(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // 用户显式 set BRAIN_TYPE → 不推 (尊重显式)
  if (!isBlank(source['BRAIN_TYPE'])) return source
  // 没 set AI_KEY → 没法推, 让后续 zod / brain factory 抛
  if (isBlank(source['AI_KEY'])) return source

  return {
    ...source,
    BRAIN_TYPE: 'deepseek',
    AI_URL: isBlank(source['AI_URL']) ? 'https://api.deepseek.com/v1' : source['AI_URL'],
    AI_MODEL: isBlank(source['AI_MODEL']) ? 'deepseek-chat' : source['AI_MODEL'],
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
  //   gpt-sovits : 用户本地 (需起 GPT-SoVITS server :8000, 中文专用)
  //   voxcpm     : OpenBMB VoxCPM2, voice design 自然语言描声 (需起 tools/voxcpm-server :8001)
  TTS_TYPE: z.enum(['mock', 'gpt-sovits', 'voxcpm']).default('mock'),

  // VoxCPM (TTS_TYPE=voxcpm 时必填) — 没 set startup throw, 不静默走错地方
  VOXCPM_URL: z.string().url().optional(),
  // VoxCPM voice design 自然语言描述声音 (性别/年龄/情绪/语速); 默认温柔女声
  VOXCPM_VOICE_DESIGN: z.string().default('温柔女声, 25 岁, 中性情绪, 语速适中'),

  // Brain · BYO LLM (PRD-002 简化, 2026-06-XX)
  // 哲学: 每个 brain 都用同一对孔位 AI_URL + AI_KEY + AI_MODEL, 一一对应减少出错
  // BRAIN_TYPE 决定走哪条代码路径 (claude CLI vs OpenAI compat)
  //   BRAIN_TYPE=claude        用户本地 Claude CLI 子进程, 不需 AI_*
  //   BRAIN_TYPE=deepseek      AI_URL=https://api.deepseek.com/v1, AI_MODEL=deepseek-chat
  //   BRAIN_TYPE=ollama        AI_URL=http://localhost:11434/v1, AI_MODEL=qwen2.5:7b
  //   BRAIN_TYPE=openai-compat AI_URL=自填 (官方/自部署/任何 OpenAI-compatible)
  //   BRAIN_TYPE=custom        composition root 自塞 URL resolver
  BRAIN_TYPE: z
    .enum(['claude', 'deepseek', 'ollama', 'openai-compat', 'custom'])
    .default('openai-compat'),

  // 通用 AI 孔位 — 所有 brand 共用 (PRD-002 决议: 改 6 孔为 3 孔, 风险更小)
  AI_URL: z.string().url().optional(),
  AI_KEY: z.string().optional(),
  AI_MODEL: z.string().default('gpt-4o-mini'),

  // 数据库
  DATABASE_URL: z.string().default('./data/deepulse.db'),

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
