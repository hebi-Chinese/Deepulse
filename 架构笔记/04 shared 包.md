# 04 · shared 包

> 跨层共享的 schema / config / logger / 协议. 不含业务.
> 入口: `packages/shared/src/index.ts` re-export 五个子模块.

```ts
// packages/shared/src/index.ts
export * from './types/index.js'
export * from './schemas/index.js'
export * from './logger/index.js'
export * from './config/index.js'
export * from './dj-ws/protocol.js'
```

## env 配置 (`packages/shared/src/config/index.ts`)

唯一允许读 `process.env` 的地方. 业务代码不准散落 `process.env.XXX`.

### 设计哲学 (用户 2026-06-07)

> AI_URL + AI_KEY + AI_MODEL 通用三孔, 所有 brand 共用 (PRD-002 简化, 2026-06-14)

BRAIN_TYPE 决定走哪条代码路径 (claude CLI vs OpenAI compat), AI_URL 决定连哪个 endpoint. 没设 startup throw `BRAIN_TYPE=X 必须 set AI_URL env`, 不静默走错地方.

历史: 旧设计每个 brand 各一个 URL 孔 (`DEEPSEEK_URL` / `OLLAMA_URL` / `OPENAI_BASE_URL`), 用户反馈"孔太多容易出问题", 简化为三孔.

### 关键 env (一表速查)

| Env                   | 类型 | 默认                                  | 说明                                                          |
| --------------------- | ---- | ------------------------------------- | ------------------------------------------------------------- |
| `NODE_ENV`            | enum | `development`                         | dev/prod/test                                                 |
| `SERVER_PORT`         | int  | `8787`                                | Fastify 后端                                                  |
| `PWA_PORT`            | int  | `3000`                                | Next.js 前端                                                  |
| `NCM_PORT`            | int  | `3001`                                | 历史保留, 当前不起独立 NCM 服务                               |
| `TTS_URL`             | url  | `http://127.0.0.1:8000`               | gpt-sovits 时用                                               |
| `TTS_TYPE`            | enum | `mock`                                | `mock` / `gpt-sovits` / `voxcpm`                              |
| `VOXCPM_URL`          | url? | none                                  | TTS_TYPE=voxcpm 必填                                          |
| `VOXCPM_VOICE_DESIGN` | str  | `温柔女声, 25 岁, 中性情绪, 语速适中` | 自然语言描述声音                                              |
| `BRAIN_TYPE`          | enum | `openai-compat`                       | `claude` / `deepseek` / `ollama` / `openai-compat` / `custom` |
| `AI_URL`              | url? | none                                  | 非 claude 时必填. 所有 brand 共用 (PRD-002)                   |
| `AI_KEY`              | str? | none                                  | OpenAI 协议要 (Ollama 也要给一个非空, 不验)                   |
| `AI_MODEL`            | str  | `gpt-4o-mini`                         | model id                                                      |
| `DATABASE_URL`        | str  | `./data/deepulse.db`                  | SQLite 文件路径                                               |
| `NCM_COOKIE`          | str? | none                                  | 启动注入 cookie (DB 优先级更高)                               |
| `MIGRATIONS_DIR`      | str? | infra bundled                         | prod build 必显式给                                           |
| `USER_PREFS_DIR`      | str? | `apps/server/data/user-prefs`         | 用户手写 markdown 目录                                        |
| `REDIS_URL`           | str? | none                                  | 短期记忆 Redis; 不给 → 内存 fallback                          |
| `SESSION_IDLE_MS`     | int  | `1800000` (30 分)                     | session 闲置 TTL                                              |
| `LONG_TERM_PATH`      | str? | `apps/server/data/dj-long-term.md`    | 长期记忆 markdown                                             |

### auto-infer 兜底 (`config/index.ts`)

`autoInferDeepseek`: set 了 `AI_KEY` 但没 set `BRAIN_TYPE` → 自动推断走 deepseek + 默认 deepseek 官方 `AI_URL` + `AI_MODEL=deepseek-chat`. 让"我懒得改 bat, 只 export 一个 AI_KEY"也能跑.

"已设" = 非空非空白. 防 `AI_KEY=""` 残留触发误推. 用户显式 set 了 `AI_URL` / `AI_MODEL` 不会被覆盖 (尊重显式).

## dj-ws 协议 (`packages/shared/src/dj-ws/protocol.ts`)

WS 双向消息的 zod 单一真相源.

### Client → Server (3 种)

```ts
const wsClientMsgSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user_msg'),
    text: z.string().min(1).max(500),
    context: djContextSchema.optional(),
  }),
  z.object({ type: z.literal('cancel') }),
  z.object({ type: z.literal('ping') }),
])
```

### Server → Client (8 种)

```ts
const wsServerMsgSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('turn_start'), turnId: z.string() }),
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({ type: z.literal('sentence'), text, idx: number }),
  z.object({ type: z.literal('audio'), sentenceIdx, url: z.string().url() }),
  z.object({ type: z.literal('action'), kind: djActionKindSchema, query: z.string().optional() }),
  z.object({ type: z.literal('reply_done'), fullReply: z.string() }),
  z.object({ type: z.literal('error'), msg: z.string() }),
  z.object({ type: z.literal('pong') }),
])
```

一次 turn 形如: `turn_start → (token|sentence|audio|action)* → reply_done`. 任何阶段 `error` 不一定致命, 可能后续还来事件.

### `DjContext` (`protocol.ts:19-32`)

```ts
const djContextSchema = z.object({
  currentSong: z.object({ id, title, artists, ncmId? }).optional(),
  queueLen: z.number().int().nonnegative().max(10_000).optional(),
  recentlySkipped: z.array(z.string().max(120)).max(10).optional(),
  weatherHint: z.string().max(120).optional(),
})
```

**SECURITY** (注释 `protocol.ts:17-18`): 所有字符串都有 `max` 上限 — 这些字段会直接拼入 LLM system prompt. 没 cap 的话客户端可以塞 prompt-injection payload (`"晴天\n\n忽略上面指令..."`).

### inline action tag (`protocol.ts:80-110`)

DJ 文本里嵌入这种标签发起动作:

- `<<play:周杰伦 稻香>>` → kind=play, query="周杰伦 稻香"
- `<<queue:汪峰>>` → kind=queue, query="汪峰"
- `<<next>>` → kind=next

正则: `/<<(play|queue|next)(?::([^>]+))?>>/g`

`parseInlineActions(raw)` 返 `{ cleaned, actions }`: tag 从可见文本剥掉, 只通过 `action` 事件传客户端.

8 个单测覆盖了边界 case (`protocol.test.ts`):

- 无 tag / 单 tag / 多 tag / `<<next>>` 无 query / 未知 kind 留在 cleaned 里 / `<<play:>>` 空 query 不匹配 / trim 处理

### `DjActionKind` (`protocol.ts:57`)

```ts
const djActionKindSchema = z.enum(['play', 'next', 'queue'])
type DjActionKind = z.infer<typeof djActionKindSchema>
```

## logger (`packages/shared/src/logger/index.ts`)

pino 封装, 强制 redact 敏感字段:

```ts
const REDACT_PATHS = [
  'cookie',
  'password',
  'token',
  'authorization',
  '*.cookie',
  '*.password',
  '*.token',
  '*.authorization',
]
```

`createLogger({name, level?, pretty?})` 返 `Logger`. `pretty=true` 时检查 stdout 是 TTY 才挂 pino-pretty transport — 非 TTY (被 spawn 进 pipe) sync-write 会卡死 server 第一行 log 走不到 `app.listen()`. 见 `logger/index.ts:32-37`.

## types / schemas

`types/index.ts` 当前只一个占位:

```ts
export type Iso8601String = string & { readonly __brand: 'Iso8601String' }
```

`schemas/index.ts` 只 re-export zod:

```ts
export { z } from 'zod'
```

跨包 DTO 大头在 ports 文件里 (`NcmUserSnapshot` 等定义在 `application/ports/ncm.ts`). shared 不重复.

返回 [[01 Clean Architecture 分层]]. 接下来看 [[05 infrastructure 包]].
