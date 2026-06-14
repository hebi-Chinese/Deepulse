# 02 · domain 包

> **零外部依赖**. 只定义 TypeScript 类型 + 错误类. 内层的内层.
> 入口: `packages/domain/src/index.ts` 把下面所有子模块 re-export.

## Branded ID (`packages/domain/src/ids.ts`)

防止 `SongId` 被当 `UserId` 用 — 类型层面强约束:

```ts
type Brand<T, B extends string> = T & { readonly __brand: B }

export type SongId = Brand<string, 'SongId'>
export type PlanId = Brand<string, 'PlanId'>
export type BubbleId = Brand<string, 'BubbleId'>
export type UserId = Brand<string, 'UserId'>
export type ArtistId = Brand<string, 'ArtistId'>
export type AlbumId = Brand<string, 'AlbumId'>
export type PlaylistId = Brand<string, 'PlaylistId'>

export const toSongId = (raw: string): SongId => raw as SongId
// ... 其余对称
```

**用法约束**: 普通 `string` 进入系统的**边界**才 cast 成 branded — 比如:

- NCM 返回 raw `id: number` → `toSongId(String(raw.id))` (见 `packages/infrastructure/src/ncm/index.ts:80-87`)
- HTTP 路径参数 `:id` → `toSongId(parsedString)` (见 `apps/server/src/api/song.ts:21`)
- DB row → `toSongId(row.id)` (见 `packages/infrastructure/src/db/repos/song-repo.ts:38`)

内部函数签名都用 branded 类型, 中途不能再随便用 `string` 替换 — 编译器会报错.

## 业务实体

### `Song` / `Artist` / `Album` (`packages/domain/src/song.ts`)

```ts
type Song = {
  readonly id: SongId
  readonly ncmId: string // 网易云原 ID (数字字符串)
  readonly title: string
  readonly artists: readonly Artist[]
  readonly album?: Album
  readonly durationMs: number
  readonly coverUrl?: string
}

type Artist = { readonly id: ArtistId; readonly name: string }
type Album = { readonly id: AlbumId; readonly name: string }
```

**核心约定**:

- 一切字段 `readonly` — Standards §7 不可变默认
- 没有运行时校验 — 校验在 `packages/infrastructure/src/ncm/schemas.ts` 的 zod schema 那里 (NCM 边界)
- 业务 ID (`SongId`) 跟 `ncmId` 分开存 — `id` 是 branded 内部用, `ncmId` 是网易云原值, 给 NCM API 回调用. 当前实现里两者都是数字字符串相同, 但**概念上独立**

### `Bubble` (`packages/domain/src/bubble.ts`)

DJ 在歌曲间说的话:

```ts
type BubbleKind = 'say' | 'segue' | 'reaction' | 'greeting'
type Bubble = {
  readonly id: BubbleId
  readonly kind: BubbleKind
  readonly text: string
  readonly audioUrl?: string // TTS 合成的 wav URL; 没合成则空
  readonly createdAtMs: number
}
```

DB 有 `bubbles` 表对应 (`packages/infrastructure/src/db/schema.ts:36`), 但当前**没有 use case 在写**它 — 留作 M3+ 扩展. DJ chat 走的是 `conversations` 表 + Redis short-term, 不走 bubbles.

### `Plan` + `PlanItem` (`packages/domain/src/plan.ts`)

每日节目单:

```ts
type PlanItemStatus = 'queued' | 'playing' | 'played' | 'skipped'
type PlanItem = {
  readonly slotAtMs: number
  readonly songId: SongId
  readonly reason: string
  readonly status: PlanItemStatus
}
type Plan = {
  readonly id: PlanId
  readonly dateIso: string // 'YYYY-MM-DD'
  readonly items: readonly PlanItem[]
}
```

同样**没有 use case 在用** — 目前 DJ 是"实时反应式"挑歌, 没"早上生成今日节目单"那条流程. 类型/表都留好, 但 v0.1.0 不依赖.

### `MoodContext` (`packages/domain/src/mood.ts`)

```ts
const MOODS = ['calm', 'happy', 'sad', 'energetic', 'focused', 'melancholic'] as const
type Mood = (typeof MOODS)[number]
type EnergyLevel = number // 0-10
type MoodContext = {
  readonly mood: Mood
  readonly energy: EnergyLevel
  readonly setAtMs: number
  readonly setBy: 'user' | 'system'
}
```

枚举 + 连续值分开存 — mood 离散, energy 连续. 同样目前**没有 use case 在用**, 是为后续 mood-aware 选歌占位.

### `TasteDocument` + `MoodRule` + `Routine` (`packages/domain/src/taste.ts`)

用户品味 (`taste.md` / `mood-rules.md` / `routines.md` 解析后的内存表示). 没有 parser 实现 — 当前 `IUserPrefsRepo` 走简化版 `long-term.md` / `short-term.md` 直接整段塞 prompt, 不解析成结构.

## 错误类 (`packages/domain/src/errors.ts`)

```ts
class DomainError extends Error {
  override readonly name: string = 'DomainError'
}

class NotFoundError extends DomainError {           // "X not found: id"
  constructor(resource: string, id: string) { ... }
}

class ValidationError extends DomainError {}        // 边界校验失败 (zod 之类)

class ExternalServiceError extends DomainError {
  constructor(
    service: string,                                // "NCM" / "claude" / "voxcpm" / ...
    message: string,
    public readonly statusCode?: number,
    options?: ErrorOptions,                         // 透传 cause 链
  )
}
```

**关键约定** (跟 Standards §5 对齐):

- 错误信息必须包含: 操作 + 失败原因 + 相关 ID — 比如 `NCM search failed: status=500` 而非 `failed`
- `ExternalServiceError` 是最常见的, 所有 adapter 失败都包成它 (见 `infrastructure/brain/openai-compat/index.ts:72-76`, `infrastructure/ncm/call.ts:21-22`, 等等)
- 必须保留 `cause` 链 (用 `{ cause: err }`) — 否则 `fetch failed` 这种顶层信息丢, 没法诊断 DNS / TLS / 代理

## 为什么 domain 没 zod

zod 是**运行时校验库**, domain 是**编译期类型**. 边界 (HTTP 入口 / NCM 响应 / DB 反序列化 / WS 消息) 才用 zod 一次性校验, 通过后内部信任类型 — 不在每层重复校验 (Standards §6).

zod schema 集中在:

- `packages/shared/src/config/` — env
- `packages/shared/src/dj-ws/protocol.ts` — WS 消息
- `packages/infrastructure/src/ncm/schemas.ts` — NCM 响应
- `packages/infrastructure/src/db/repos/*` — DB JSON 列反序列化
- `apps/server/src/api/*` — HTTP 请求体 / 查询参数
- `apps/pwa/app/lib/api.ts` — 前端响应

返回 [[01 Clean Architecture 分层]]. 接下来看 [[03 application 包]].
