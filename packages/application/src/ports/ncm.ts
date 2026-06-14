// 网易云客户端接口 · 实现：infrastructure/ncm/
// 覆盖 v1 全部需要的端点：搜索 / 直链 / 歌词 / 登录 / 喜欢 / 推荐 / FM / 排行 / 云盘 / 画像快照

import type { ArtistId, PlaylistId, Song, SongId } from '@deepulse/domain'

// 与网易云接口对齐的音质等级
export type NcmAudioQuality = 'standard' | 'exhigh' | 'lossless' | 'hires'

export type NcmSearchResult = {
  readonly songs: readonly Song[]
  readonly total: number
}

export type NcmSearchSuggestion = {
  readonly songs: readonly { id: SongId; title: string }[]
  readonly artists: readonly { id: ArtistId; name: string }[]
}

export type NcmLyric = {
  readonly raw: string
  readonly translation?: string
  readonly hasYrc: boolean
  readonly yrc?: string
}

export type NcmPlaylistMeta = {
  readonly id: PlaylistId
  readonly name: string
  readonly songCount: number
  readonly coverUrl?: string
  readonly isCreated: boolean // true = 自建，false = 收藏
}

export type NcmPlayHistoryEntry = {
  readonly songId: SongId
  readonly playCount: number
}

export type NcmUserSnapshot = {
  readonly userId: string
  readonly userName: string
  readonly vipType: number
  readonly level: number
  readonly likedSongIds: readonly SongId[]
  readonly playlists: readonly NcmPlaylistMeta[]
  readonly dailyRecommendations: readonly Song[]
  readonly heartMode: readonly Song[]
  readonly stylePreferences: readonly string[]
  readonly recentPlayed: readonly NcmPlayHistoryEntry[]
  readonly fmTrashSongIds: readonly SongId[]
  readonly snapshotAtMs: number
}

export type NcmLoginQrSession = {
  readonly unikey: string
  readonly qrImg: string // base64 PNG
}

export type NcmLoginQrStatus =
  | { readonly state: 'pending' }
  | { readonly state: 'scanned' } // 已扫码,等用户在 App 确认
  | { readonly state: 'success'; readonly cookie: string }
  | { readonly state: 'expired' }

export type INcmClient = {
  // 搜索
  search(query: string, options?: { limit?: number }): Promise<NcmSearchResult>
  searchSuggest(query: string): Promise<NcmSearchSuggestion>

  // 播放
  getSongUrl(songId: SongId, quality: NcmAudioQuality): Promise<string>
  getLyric(songId: SongId): Promise<NcmLyric>

  // 推荐 / 发现
  dailyRecommendations(): Promise<readonly Song[]>
  privateFm(): Promise<readonly Song[]>
  heartMode(songId: SongId): Promise<readonly Song[]>
  toplist(toplistId: string): Promise<readonly Song[]>

  // 用户库
  fetchUserSnapshot(): Promise<NcmUserSnapshot>
  getMyPlaylists(): Promise<readonly NcmPlaylistMeta[]>
  getPlaylistTracks(playlistId: PlaylistId, options?: { limit?: number }): Promise<readonly Song[]>
  /**
   * 批量拿歌曲元信息 (PRD-005: cold-start hydrate snapshot 用)
   * 一次最多 ~100 个 ID (NCM song/detail 接口上限). 返 Map(songId -> Song), 缺的 ID 不在 map 里
   */
  batchSongDetail(songIds: readonly SongId[]): Promise<ReadonlyMap<SongId, Song>>

  // 互动
  like(songId: SongId, on: boolean): Promise<void>
  fmTrash(songId: SongId): Promise<void>

  // 登录
  qrCreate(): Promise<NcmLoginQrSession>
  qrCheck(unikey: string): Promise<NcmLoginQrStatus>

  // cookie 管理
  setCookie(cookie: string): void
  clearCookie(): void
  getCookie(): string | undefined
}
