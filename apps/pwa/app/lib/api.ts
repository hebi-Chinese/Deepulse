// 前端 API 客户端 · 调后端 fastify · 所有响应走 zod 校验

import { z } from 'zod'

import { env } from './env'

// ── 响应 schema (单一真相源,导出类型用 z.infer) ──

const apiArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
})
const apiAlbumSchema = z.object({
  id: z.string(),
  name: z.string(),
})
const apiSongSchema = z.object({
  id: z.string(),
  ncmId: z.string(),
  title: z.string(),
  artists: z.array(apiArtistSchema),
  album: apiAlbumSchema.optional(),
  durationMs: z.number(),
  coverUrl: z.string().optional(),
  // 本地导入歌:有 localUrl (blob URL) 时跳过 NCM fetch,直接喂 audio.src
  // 不入 zod (后端永远不返回这字段),仅 frontend 内部用
})

const searchRespSchema = z.object({
  songs: z.array(apiSongSchema),
  total: z.number(),
})
const songsListSchema = z.object({ songs: z.array(apiSongSchema) })
const apiPlaylistMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  songCount: z.number(),
  coverUrl: z.string().optional(),
  isCreated: z.boolean(),
})
const myPlaylistsRespSchema = z.object({ playlists: z.array(apiPlaylistMetaSchema) })

export type ApiPlaylistMeta = z.infer<typeof apiPlaylistMetaSchema>
const songUrlSchema = z.object({ url: z.string(), quality: z.string() })
const lyricSchema = z.object({
  raw: z.string(),
  translation: z.string().optional(),
  hasYrc: z.boolean(),
  yrc: z.string().optional(),
})
const qrCreateSchema = z.object({
  unikey: z.string(),
  qrImg: z.string(),
})
const qrCheckSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending') }),
  z.object({ state: z.literal('scanned') }),
  z.object({ state: z.literal('success') }),
  z.object({ state: z.literal('expired') }),
])
const loginStatusSchema = z.object({ loggedIn: z.boolean() })
const okSchema = z.object({ ok: z.boolean() })

export type ApiArtist = z.infer<typeof apiArtistSchema>
export type ApiAlbum = z.infer<typeof apiAlbumSchema>
type ApiSongBase = z.infer<typeof apiSongSchema>
export type ApiSong = ApiSongBase & {
  // 仅本地导入时存在:blob URL,刷新即失效,不入 localStorage
  readonly localUrl?: string
}
export type ApiLyric = z.infer<typeof lyricSchema>

// ── 底层 fetch + zod ──

async function get<T>(path: string, schema: z.ZodSchema<T>): Promise<T> {
  const res = await fetch(`${env.serverUrl}${path}`, { credentials: 'include' })
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${String(res.status)} ${res.statusText}`)
  }
  return validate(await res.json(), schema, path)
}

async function post<T>(path: string, schema: z.ZodSchema<T>, body?: unknown): Promise<T> {
  // Fastify 不允许 Content-Type application/json + 空 body (FST_ERR_CTP_EMPTY_JSON_BODY → 400),
  // 所以只在真有 body 时才带 header
  const init: RequestInit = {
    method: 'POST',
    credentials: 'include',
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header name
    init.headers = { 'Content-Type': 'application/json' }
  }
  const res = await fetch(`${env.serverUrl}${path}`, init)
  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${String(res.status)} ${res.statusText}`)
  }
  return validate(await res.json(), schema, path)
}

function validate<T>(raw: unknown, schema: z.ZodSchema<T>, path: string): T {
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new Error(`${path} response shape invalid: ${result.error.message}`)
  }
  return result.data
}

// ── 业务 API ──

export const api = {
  search: (q: string, limit?: number) =>
    get(
      `/api/search?q=${encodeURIComponent(q)}${limit !== undefined ? `&limit=${String(limit)}` : ''}`,
      searchRespSchema,
    ),

  songUrl: (id: string, quality: 'standard' | 'exhigh' | 'lossless' | 'hires' = 'standard') =>
    get(`/api/song/${encodeURIComponent(id)}/url?quality=${quality}`, songUrlSchema),

  lyric: (id: string) => get(`/api/song/${encodeURIComponent(id)}/lyric`, lyricSchema),

  dailyRecommendations: () => get('/api/recommend/daily', songsListSchema),

  privateFm: () => get('/api/fm/next', songsListSchema),

  heartMode: (seedId: string) =>
    get(`/api/heart-mode/${encodeURIComponent(seedId)}`, songsListSchema),

  loginQrCreate: () => post('/api/login/qr/create', qrCreateSchema),

  loginQrCheck: (unikey: string, persist = false) =>
    get(
      `/api/login/qr/check?unikey=${encodeURIComponent(unikey)}&persist=${persist ? '1' : '0'}`,
      qrCheckSchema,
    ),

  loginStatus: () => get('/api/login/status', loginStatusSchema),

  logout: () => post('/api/login/logout', okSchema),

  myPlaylists: () => get('/api/playlists/mine', myPlaylistsRespSchema),

  playlistTracks: (id: string, limit?: number) =>
    get(
      `/api/playlist/${encodeURIComponent(id)}/tracks${limit !== undefined ? `?limit=${String(limit)}` : ''}`,
      songsListSchema,
    ),

  feedback: (songId: string, action: 'like' | 'unlike' | 'trash') =>
    post('/api/feedback', okSchema, { songId, action }),
}
