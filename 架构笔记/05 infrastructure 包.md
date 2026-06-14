# 05 · infrastructure 包

> 实现 application 定义的 ports. 干 IO (fetch / fs / 子进程 / DB / Redis).
> 入口: `packages/infrastructure/src/index.ts` re-export 5 个子模块.

```ts
// infrastructure/src/index.ts
export * from './brain/index.js'
export * from './tts/index.js'
export * from './ncm/index.js'
export * from './user-prefs/index.js'
export * from './clock/index.js'
// (db / short-term-memory / long-term-memory 不在 root export, composition root 走子路径 import)
```

**关键约束**: 兄弟 adapter 不互相 import — `brain/` 不引 `tts/`, 等等. 跨 adapter 协作只在 composition root 编排.

## Brain (`infrastructure/src/brain/`)

### 工厂 (`brain/index.ts`)

`createBrain(type, config): IBrain` 根据 `BRAIN_TYPE` 选实现:

| Type            | 实现                                                               | 必填 URL env            |
| --------------- | ------------------------------------------------------------------ | ----------------------- |
| `claude`        | `ClaudeCodeBrain` (execa 调本机 claude CLI)                        | 无                      |
| `deepseek`      | `OpenAICompatBrain`                                                | `AI_URL` (PRD-002 通用) |
| `ollama`        | `OpenAICompatBrain`                                                | `AI_URL` (PRD-002 通用) |
| `openai-compat` | `OpenAICompatBrain`                                                | `AI_URL` (PRD-002 通用) |
| `custom`        | `OpenAICompatBrain` + `customResolver` (composition 注入 URL 函数) | 无 (走 resolver)        |

`requiredEnvResolver` 是 lazy 闭包 — 构造 brain 实例不抛, 第一次调用 stream/generateJson 才检查. 抛错信息直接告诉用户该 set 哪个 env (`brain/index.ts:89-100`):

```ts
throw new Error(`BRAIN_TYPE=${brainType} 必须 set ${envName} env (e.g. 在 deepulse.bat 里)`)
```

### `ClaudeCodeBrain` (`brain/claude/index.ts`)

用本机 `claude` CLI 子进程实现 `IBrain`. 适合用户本地有 Pro 订阅, 不推荐他人复用 (需要 CLI).

- `stream()`: `claude -p --output-format stream-json --verbose --include-partial-messages`, 解析 NDJSON 流的 `text_delta` event (`stream-parser.ts`)
- `generateJson<T>()`: `claude -p --output-format json --json-schema {...}`, `zod-to-json-schema` 把 zod 转 JSON Schema, 双层校验 (CLI envelope + 内层 result)

**子进程管理细节**:

- system prompt 写临时文件 → `--system-prompt-file`, `finally` 清 (`brain/claude/index.ts:149-160`)
- abort 用 `cancelSignal` (execa 5+)
- `try/finally` 保证 caller `break` 出 for-await 时 child 也被 kill 收尾, 否则 promise 永挂
- `assertSafeFlagValue` 拒绝以 `--` 开头的值, 防 CLI flag 误解 (`brain/claude/index.ts:41-46`)
- TextDecoder 用 `stream:true` 跨 chunk 保住 UTF-8 多字节中文不被切断 (`brain/claude/index.ts:196`)

`splitMessages` (`brain/claude/prompt.ts`) 把 `BrainMessage[]` 拆 systemPrompt + userPrompt (CLI 接口只接受单一 prompt 参数, 多轮要拼).

### `OpenAICompatBrain` (`brain/openai-compat/index.ts`)

`POST {baseUrl}/chat/completions`, body `{model, messages, stream?, response_format?, max_tokens?, temperature?}`. 覆盖:

- OpenAI 官方 (`https://api.openai.com/v1`)
- DeepSeek (`https://api.deepseek.com/v1`)
- Ollama 本地 (`http://localhost:11434/v1`)
- vLLM / LMStudio / OpenRouter / Together / Groq / Perplexity 等任何兼容

`stream()`: SSE 行 `data: {json}` 直到 `data: [DONE]`. 解析在 `parseSseContent` (`openai-compat/index.ts:200-230`), 共享 TextDecoder 跨 chunk 中文不切断. `safeParseChunk` 静默丢坏 chunk (单 chunk 坏不中断整流, `openai-compat/index.ts:248-256`).

`generateJson()`: 非流 + `response_format: {type: 'json_object'}`. 三层校验:

1. envelope schema (choices[0].message.content 存在)
2. `JSON.parse(content)`
3. 用户传的 `schema` zod 校验

`wrapFetchError` (`openai-compat/index.ts:173-183`) — fetch 抛 `TypeError("fetch failed")` 时把 `.cause` 链拼进 message (cause name + message + code), 否则上层只看到 "fetch failed" 没法诊断 DNS / TLS / proxy / refused.

超时合成 (`openai-compat/index.ts:163-170`): 用 `AbortSignal.any([callerSignal, AbortSignal.timeout(180s)])`, 任一触发 abort.

## TTS (`infrastructure/src/tts/`)

### 工厂 (`tts/index.ts`)

`createTts(type, config): ITtsClient`:

| Type         | 实现                 | 必填                                                               |
| ------------ | -------------------- | ------------------------------------------------------------------ |
| `mock`       | `MockTtsClient`      | 无, 返 1 秒静音 wav                                                |
| `gpt-sovits` | `GptSovitsTtsClient` | `TTS_URL` (有默认 127.0.0.1:8000)                                  |
| `voxcpm`     | `VoxCpmTtsClient`    | `VOXCPM_URL` (必显式 set, 不预填) + `VOXCPM_VOICE_DESIGN` (有默认) |

### `VoxCpmTtsClient` (`tts/voxcpm/index.ts`)

`POST {baseUrl}/synthesize` body `{text, voice_design}`. `voice_design` 是自然语言描声 (性别/年龄/情绪/语速). 把 emotion 通过中文前缀拼进 voice_design (`voxcpm/index.ts:25-32`):

```ts
const EMOTION_HINTS = { 开心: '语气开心明亮', 中立: '语气平稳' } // 只两个, 不做负面
```

不在 server 端处理 — server 应只做 model 翻译, 不知道 Deepulse 的 emotion enum.

冷启时长 ~30s (模型 4GB), `HEADERS_TIMEOUT_MS = BODY_TIMEOUT_MS = 60_000`.

### `GptSovitsTtsClient` (`tts/gpt-sovits/index.ts`)

`POST {baseUrl}/infer_single` body `{version: 'v4', model_name: '<your-sovits-model-id>', emotion, text, text_lang: '中文', prompt_text_lang: '中文', media_type: 'wav'}`. 中文专用 + emotion 2 选 1 (中立/开心). model_name 是 fork 者 SoVITS server 上的模型 id.

`HEADERS_TIMEOUT_MS = BODY_TIMEOUT_MS = 30_000` (vox 长一倍, sovits 短).

### `MockTtsClient` (`tts/mock/index.ts`)

返 1 秒 mono 16-bit 22050Hz 静音 wav (44 byte header + 44100 byte 零数据), base64 内联到 data URI. 首次调用 `logger.warn` 一次, 后续静默.

让 fork 者**首次跑能跑完整 UI demo 不报错** (audio 元素能 play, 听不到声但不卡 UI).

### `rewriteHost` (voxcpm / sovits 同款)

Server 默认绑 `0.0.0.0` 时返 URL 里也是 `://0.0.0.0`, 浏览器无法解析. 统一替换 `127.0.0.1` (`voxcpm/index.ts:82-84`, `gpt-sovits/index.ts:77-80`).

## NCM (`infrastructure/src/ncm/`)

### `NcmClient` (`ncm/index.ts`)

实现 `INcmClient`. 直接 `import NCM from 'NeteaseCloudMusicApi'` 当 Node 库用 (不 spawn 子进程). NCM 库是 CJS, ESM 不能 named import — 顶层一个大 destructure (`ncm/index.ts:55-77`).

Cookie 状态在实例字段 `this.cookie`. `setCookie` / `clearCookie` / `getCookie` 是同步 (不 IO). `withCookie<T>(params): T` 把 cookie 注入到每次 NCM API 调用的 params (`ncm/index.ts:125-127`).

**重要方法**:

- `search(q, {limit})` — `cloudsearch`, 默认 limit=30
- `getSongUrl(songId, quality)` — `song_url_v1`, 返 NCM CDN URL. 灰歌/版权下架 → 抛 `ExternalServiceError('NCM', 'no playable URL for song ${id} (灰歌/版权下架?)')`
- `getLyric(songId)` — `lyric`, 返 `{raw, translation?, hasYrc, yrc?}`
- `dailyRecommendations` / `privateFm` / `heartMode(songId)` / `toplist(toplistId)` — 推荐发现
- `getMyPlaylists` — `user_playlist(uid=0, limit=200)`. 自建 vs 收藏 用 `playlist[0].userId` 近似自己的 userId (注释承认这是 hack, `ncm/index.ts:225-228`). TODO(2026-05-27): limit=200 超过会静默截断, M3 推荐期再做分页
- `fetchUserSnapshot` — 并行调 7 个接口 (userDetail, likelist, userPlaylist, recommend, stylePreference, userRecord, userCloud) 拼一个 `NcmUserSnapshot`
- `qrCreate` → `loginQrKey` 拿 unikey + `loginQrCreate` 拿 base64 PNG
- `qrCheck(unikey)` → `loginQrCheck`, NCM code 约定: 800 过期 / 801 等待扫码 / 802 已扫码待确认 / 803 授权成功+返 cookie. switch 翻译成 `NcmLoginQrStatus` discriminated union (`ncm/index.ts:369-385`)

### `callNcm` (`ncm/call.ts`)

统一封装"调库 → 校验 envelope → 校验 body shape"三步. NCM 库返回 `{status: number, body: unknown}`, `callNcm`:

1. try fn() 包 `ExternalServiceError('NCM', '${op}: network/lib error', { cause })`
2. envelope schema 校验顶层 status + body
3. status !== 200 → 抛 `ExternalServiceError` 带 statusCode
4. bodySchema 校验 body

所有 NCM 方法只需调一次, 不重复写 status 检查.

### `schemas.ts`

每个 NCM 接口的 body zod schema. `RawSong` schema 是核心:

```ts
const rawSongSchema = z.object({
  id: z.number(),
  name: z.string(),
  ar: z.array(z.object({ id, name })).optional(),
  al: z.object({ id, name, picUrl? }).optional(),
  dt: z.number().optional(),       // duration ms
})
```

`rawToSong` 把 RawSong → Song (branded id + 默认值, `ncm/index.ts:80-96`).

## DB (`infrastructure/src/db/`)

### `client.ts` — better-sqlite3 + drizzle

```ts
createDb(dbUrl): {
  db,                                          // drizzle instance
  close,                                       // 关 sqlite
  applyMigrations(migrationsFolder?)           // migrations 默认 infra bundled
}
```

`pragma('journal_mode = WAL')` + `pragma('foreign_keys = ON')`.

Migrations 默认路径自解析 (`client.ts:22-23`):

```ts
const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLED_MIGRATIONS_DIR = resolve(HERE, 'migrations')
```

architect HIGH-4 fix: 之前 composition root 写死了 `../../../packages/infrastructure/src/db/migrations`, prod build 必坏 (dist 下相对路径跑偏).

### `schema.ts` — drizzle 表定义

详见 [[12 数据库 schema 与关键约定]]. 10 张表: `songs / plays / bubbles / plans / plan_items / prefs / taste_snapshots / conversations / ncm_account / ncm_snapshot`.

### Repos (`db/repos/`)

每个表对应一个 repo 工厂, 实现 application 的 `IXxxRepo` port:

- `createSongRepo` — `findById` / `upsert` (artists 列存 JSON, 反序列化用 zod 校验 `db/repos/song-repo.ts:14-29`)
- `createPlaysRepo` — `recordPlay` / `recentPlays(limit)` / `countPlays(songId, sinceMs)`
- `createNcmAccountRepo` — `saveCookie` (单行 id=1 upsert) / `loadCookie` / `clear`
- `createNcmSnapshotRepo` — `save` (transaction 同步 ncm_snapshot + ncm_account 元信息, `db/repos/ncm-snapshot-repo.ts:65-95`) / `load` (zod 校验顶层 + 关键嵌套) / `status`
- `createConversationsRepo` — `append`, 单表 append-only

Drizzle 默认 sync API (better-sqlite3 sync), 但 port 接口是 async — 用 `/* eslint-disable @typescript-eslint/require-await */` 处理.

## 短期记忆 (`infrastructure/src/short-term-memory/`)

### 工厂 (`short-term-memory/index.ts`)

`createShortTermMemoryRepo({redisUrl, idleTtlMs, clock, log?})`:

- `redisUrl === undefined` → `createInMemoryShortTermRepo`
- 否则 try connect Redis (`lazyConnect: true, maxRetriesPerRequest: 2`)
- ctor 抛 → fallback 内存版 + log warn

**关键**: Redis 连接失败时**不抛** — 静默退回 in-memory (dev / fork 者首次跑无 Redis 也能跑). 真线想强校验, composition 自查.

### Redis 实现 (`short-term-memory/redis-repo.ts`)

Key 设计 (单用户应用, 没分租户):

```
deepulse:mem:active   STRING  "1"     TTL = idleTtlMs (每次 appendTurn 重置)
deepulse:mem:session  LIST    JSON[]  no TTL
```

活跃判定: `EXISTS deepulse:mem:active`. session 边界: active 过期 → `isSessionActive=false` 但 session list 还在 → 调用方 (use case) 拉出来 distill → clear list → 下次 `appendTurn` 起新 session.

**multi/exec 原子**: `appendTurn` 用 `multi().set(active, EX).rpush(session, json).exec()`. `assertMultiExecOk` 检查 results 非 null 且每 cmd 没 err — ioredis exec 单 cmd 失败不抛, 静默吞 (`redis-repo.ts:88-103`).

`loadCurrentSession` 用 `multi().exists(active).lrange(session, 0, -1).exec()` — `EXISTS + LRANGE` 必须原子, 两次 round-trip 中间 TTL 过期会把过期 session 的 turn 当 active 喂回 prompt.

`parseSessionTurn` 用 zod 校验 — Redis 里的 untrusted bytes (schema 漂移 / 外部写入) 不能静默喂进 prompt.

### 内存实现 (`short-term-memory/in-memory-repo.ts`)

单进程, 跨重启会丢. `turns: SessionTurn[]` + `lastActiveAtMs: number | null`. `isActive` 用 `cfg.clock.nowMs() - lastMs < idleTtlMs`.

不用 `setTimeout` — 那个跨重启丢, 也跟实际"现在时间"耦合.

## 长期记忆 (`infrastructure/src/long-term-memory/filesystem-repo.ts`)

markdown 文件 append, 每行 `- [YYYY-MM-DD HH:MM] {summary}`. `load` 解析 regex `/^- \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] (.+)$/`, 过滤不匹配的行 (容错).

`safeRead`: 只把 ENOENT 当 null, 其他 (权限 / 磁盘) 抛出去 — 否则 load 静默返空, append 基于空 base 重写, 数据丢光 (`filesystem-repo.ts:41-48`).

## user-prefs (`infrastructure/src/user-prefs/filesystem-repo.ts`)

读 `dataDir/long-term.md` + `dataDir/short-term.md`:

- long-term: 用户手写 markdown, 整段返出
- short-term: 每行 `YYYY-MM-DD: 描述`, 过滤掉 > 7 天的旧行

`MAX_BYTES_PER_FILE = 8 * 1024` — 防误塞大文件撑爆 prompt. 用 UTF-8 字节数 (不是 `.length`, 那是 UTF-16 code unit 数, 中文会算少). 超长截断时 warn, TextDecoder `fatal:false` 替换不完整 UTF-8 序列不在中文中间截断.

`filterExpiredEntries(content, nowMs)` 公开导出 — 单元测试能注入 nowMs 控制 TTL 边界 (`user-prefs/filesystem-repo.ts:63-76`).

**SECURITY** 注释 (`filesystem-repo.ts:6-8`): 这两份文件内容会直接拼入 LLM system prompt. 当前信任边界 = 本机文件系统手写. 未来加"DJ 自动写 prefs"路径必须先做 inline-action tag 剥离 / 大小限制 / 角色提示词逃逸检测.

## clock (`infrastructure/src/clock/index.ts`)

```ts
function createSystemClock(): IClock {
  return { nowMs: () => Date.now() }
}
```

测试时用 FakeClock 替换. 不在这层关心.

返回 [[01 Clean Architecture 分层]]. 接下来看 [[06 apps-server]].
