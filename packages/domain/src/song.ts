// 歌曲实体 · 业务核心
// readonly 默认；运行时校验在 @deepulse/shared/schemas，这里只声明结构

import type { SongId, ArtistId, AlbumId } from './ids.js'

export type Song = {
  readonly id: SongId
  readonly ncmId: string // 网易云原 ID（数字字符串）
  readonly title: string
  readonly artists: readonly Artist[]
  readonly album?: Album
  readonly durationMs: number
  readonly coverUrl?: string
}

export type Artist = {
  readonly id: ArtistId
  readonly name: string
}

export type Album = {
  readonly id: AlbumId
  readonly name: string
}
