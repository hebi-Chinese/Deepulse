// 网易云客户端 · 完整 v1 实现
// 直接 import Binaryify/NeteaseCloudMusicApi 作为 Node 库（不 spawn 子进程）
// 所有响应走 zod schema 校验 (Standards §1.3 + §6.1)

import {
  ExternalServiceError,
  toAlbumId,
  toArtistId,
  toPlaylistId,
  toSongId,
} from '@claudio/domain'
// NCM 库是 CJS，ESM 不能 named import；解构重命名为 camelCase
import NCM from 'NeteaseCloudMusicApi'

import { callNcm } from './call.js'
import {
  fmBodySchema,
  genericBodySchema,
  intelligenceBodySchema,
  likelistBodySchema,
  lyricBodySchema,
  playlistTracksBodySchema,
  qrCheckBodySchema,
  qrCreateBodySchema,
  qrKeyBodySchema,
  recommendBodySchema,
  searchBodySchema,
  songUrlBodySchema,
  stylePrefBodySchema,
  suggestBodySchema,
  toplistBodySchema,
  userCloudBodySchema,
  userDetailBodySchema,
  userPlaylistBodySchema,
  userRecordBodySchema,
  type RawPlaylistEntry,
  type RawSong,
} from './schemas.js'

import type {
  IClock,
  INcmClient,
  NcmAudioQuality,
  NcmLoginQrSession,
  NcmLoginQrStatus,
  NcmLyric,
  NcmPlaylistMeta,
  NcmSearchResult,
  NcmSearchSuggestion,
  NcmUserSnapshot,
} from '@claudio/application'
import type { PlaylistId, Song, SongId } from '@claudio/domain'
import type { z } from 'zod'

const {
  cloudsearch,
  fm_trash: fmTrash,
  like: ncmLike,
  likelist,
  login_qr_check: loginQrCheck,
  login_qr_create: loginQrCreate,
  login_qr_key: loginQrKey,
  lyric: ncmLyric,
  personal_fm: personalFm,
  playlist_track_all: playlistTrackAll,
  playmode_intelligence_list: playmodeIntelligenceList,
  recommend_songs: recommendSongs,
  search_suggest: searchSuggestFn,
  song_url_v1: songUrlV1,
  style_preference: stylePreference,
  toplist_detail: toplistDetail,
  user_cloud: userCloud,
  user_detail: userDetail,
  user_playlist: userPlaylist,
  user_record: userRecord,
} = NCM

// ─── domain mapper ───────────────────────────────────────────────────────

function rawToSong(raw: RawSong): Song {
  const base = {
    id: toSongId(String(raw.id)),
    ncmId: String(raw.id),
    title: raw.name,
    artists: (raw.ar ?? []).map((a) => ({
      id: toArtistId(String(a.id)),
      name: a.name,
    })),
    durationMs: raw.dt ?? 0,
  }
  const withAlbum =
    raw.al !== undefined
      ? { ...base, album: { id: toAlbumId(String(raw.al.id)), name: raw.al.name } }
      : base
  return raw.al?.picUrl !== undefined ? { ...withAlbum, coverUrl: raw.al.picUrl } : withAlbum
}

// ─── Client ───────────────────────────────────────────────────────────────

export class NcmClient implements INcmClient {
  private cookie: string | undefined

  // clock 注入: snapshotAtMs 等时间戳走 IClock 而非 Date.now(), 测试可控 + 边界一致
  constructor(
    cookie: string | undefined,
    private readonly clock: IClock,
  ) {
    this.cookie = cookie
  }

  setCookie(cookie: string): void {
    this.cookie = cookie
  }

  clearCookie(): void {
    // 必须有 — 否则 logout 删了 DB 但内存里还在,所有 getCookie() 守卫的接口
    // (playlists/mine, snapshot/refresh, ...) 在本进程内仍然"已登录"
    this.cookie = undefined
  }

  getCookie(): string | undefined {
    return this.cookie
  }

  private withCookie<T extends object>(params: T): T {
    return this.cookie !== undefined ? { ...params, cookie: this.cookie } : params
  }

  // ── 搜索 ──

  async search(query: string, options?: { limit?: number }): Promise<NcmSearchResult> {
    const body = await callNcm(
      () => cloudsearch(this.withCookie({ keywords: query, limit: options?.limit ?? 30 })),
      searchBodySchema,
      'search',
    )
    const songs = (body.result?.songs ?? []).map(rawToSong)
    return { songs, total: songs.length }
  }

  async searchSuggest(query: string): Promise<NcmSearchSuggestion> {
    // type 字段在 NCM 库声明里是 const enum,isolatedModules 下无法 import,只能 bridge
    const body = await callNcm(
      () =>
        searchSuggestFn(this.withCookie({ keywords: query, type: 'mobile' as unknown as never })),
      suggestBodySchema,
      'searchSuggest',
    )
    return {
      songs: (body.result?.songs ?? []).map((s) => ({
        id: toSongId(String(s.id)),
        title: s.name,
      })),
      artists: (body.result?.artists ?? []).map((a) => ({
        id: toArtistId(String(a.id)),
        name: a.name,
      })),
    }
  }

  // ── 播放 ──

  async getSongUrl(songId: SongId, quality: NcmAudioQuality): Promise<string> {
    // level 字段在 NCM 库声明里是 const enum,isolatedModules 下无法 import,bridge 进入
    const params = this.withCookie({ id: songId, level: quality })
    const body = await callNcm(
      () => songUrlV1(params as unknown as Parameters<typeof songUrlV1>[0]),
      songUrlBodySchema,
      'getSongUrl',
    )
    const url = body.data?.[0]?.url
    if (url === null || url === undefined) {
      throw new ExternalServiceError('NCM', `no playable URL for song ${songId} (灰歌/版权下架?)`)
    }
    return url
  }

  async getLyric(songId: SongId): Promise<NcmLyric> {
    const body = await callNcm(
      () => ncmLyric(this.withCookie({ id: songId })),
      lyricBodySchema,
      'getLyric',
    )
    const base: NcmLyric = {
      raw: body.lrc?.lyric ?? '',
      hasYrc: Boolean(body.yrc?.lyric),
    }
    const withTrans =
      body.tlyric?.lyric !== undefined ? { ...base, translation: body.tlyric.lyric } : base
    return body.yrc?.lyric !== undefined ? { ...withTrans, yrc: body.yrc.lyric } : withTrans
  }

  // ── 推荐 / 发现 ──

  async dailyRecommendations(): Promise<readonly Song[]> {
    const body = await callNcm(
      () => recommendSongs(this.withCookie({})),
      recommendBodySchema,
      'dailyRecommendations',
    )
    return (body.data?.dailySongs ?? []).map(rawToSong)
  }

  async privateFm(): Promise<readonly Song[]> {
    const body = await callNcm(() => personalFm(this.withCookie({})), fmBodySchema, 'privateFm')
    return (body.data ?? []).map(rawToSong)
  }

  async getMyPlaylists(): Promise<readonly NcmPlaylistMeta[]> {
    if (this.cookie === undefined) {
      throw new ExternalServiceError('NCM', 'getMyPlaylists requires login')
    }
    // user_playlist 配合 cookie 直接返回当前用户的所有 playlist (创建的 + 收藏的)。
    // 不再调 userDetail 拿 self id 区分 isCreated — userDetail 接口对未拉 snapshot 的
    // 用户偶发 'network/lib error',会拖累整条链路。
    // TODO(2026-05-27): limit 200 — 超过会被静默截断,M3 推荐期再做分页
    const body = await callNcm(
      () => userPlaylist(this.withCookie({ uid: 0, limit: 200 })),
      userPlaylistBodySchema,
      'getMyPlaylists',
    )
    const playlists = body.playlist ?? []
    if (playlists.length === 0) return []
    // selfUserId 由 playlist[0].userId 近似 (自建 playlist 通常排在前)。
    // 用户没自建任何 playlist 时,playlist[0] 是收藏的,isCreated 全部错为 false —
    // 当前没有 logger 可注入到 infra 这层,这个边界 case 之后接 logger 时补 warn
    const firstId = playlists[0]?.userId ?? 0
    return mapPlaylists(playlists, firstId)
  }

  async getPlaylistTracks(
    playlistId: PlaylistId,
    options?: { limit?: number },
  ): Promise<readonly Song[]> {
    const body = await callNcm(
      () => playlistTrackAll(this.withCookie({ id: playlistId, limit: options?.limit ?? 1000 })),
      playlistTracksBodySchema,
      'getPlaylistTracks',
    )
    return (body.songs ?? []).map(rawToSong)
  }

  async heartMode(songId: SongId): Promise<readonly Song[]> {
    const body = await callNcm(
      () => playmodeIntelligenceList(this.withCookie({ id: songId, pid: '0' })),
      intelligenceBodySchema,
      'heartMode',
    )
    return (body.data ?? [])
      .map((d) => d.songInfo)
      .filter((s): s is RawSong => s !== undefined)
      .map(rawToSong)
  }

  async toplist(toplistId: string): Promise<readonly Song[]> {
    // id 字段在 NCM 库声明里是 const enum,isolatedModules 下无法 import,bridge 进入
    const body = await callNcm(
      () =>
        toplistDetail(
          this.withCookie({ id: toplistId }) as unknown as Parameters<typeof toplistDetail>[0],
        ),
      toplistBodySchema,
      'toplist',
    )
    return (body.playlist?.tracks ?? []).map(rawToSong)
  }

  // ── 互动 ──

  async like(songId: SongId, on: boolean): Promise<void> {
    if (this.cookie === undefined) {
      throw new ExternalServiceError('NCM', 'like requires login')
    }
    await callNcm(
      () => ncmLike(this.withCookie({ id: songId, like: on })),
      genericBodySchema,
      'like',
    )
  }

  async fmTrash(songId: SongId): Promise<void> {
    if (this.cookie === undefined) {
      throw new ExternalServiceError('NCM', 'fmTrash requires login')
    }
    await callNcm(() => fmTrash(this.withCookie({ id: songId })), genericBodySchema, 'fmTrash')
  }

  // ── 登录 ──

  async qrCreate(): Promise<NcmLoginQrSession> {
    const keyBody = await callNcm(() => loginQrKey({}), qrKeyBodySchema, 'qrKey')
    const unikey = keyBody.data?.unikey
    if (unikey === undefined) {
      throw new ExternalServiceError('NCM', 'qrKey returned no unikey')
    }
    const createBody = await callNcm(
      () => loginQrCreate({ key: unikey, qrimg: true }),
      qrCreateBodySchema,
      'qrCreate',
    )
    const qrImg = createBody.data?.qrimg
    if (qrImg === undefined) {
      throw new ExternalServiceError('NCM', 'qrCreate returned no qrimg')
    }
    return { unikey, qrImg }
  }

  async qrCheck(unikey: string): Promise<NcmLoginQrStatus> {
    const body = await callNcm(() => loginQrCheck({ key: unikey }), qrCheckBodySchema, 'qrCheck')
    return interpretQrCheck(body)
  }

  // ── 用户画像快照（cold start 一次拉满）──

  async fetchUserSnapshot(): Promise<NcmUserSnapshot> {
    if (this.cookie === undefined) {
      throw new ExternalServiceError('NCM', 'fetchUserSnapshot requires login')
    }
    const raw = await this.pullSnapshotRaw()
    return this.assembleSnapshot(raw)
  }

  private async pullSnapshotRaw(): Promise<SnapshotRaw> {
    const [detail, like, play, rec, style, record, cloud] = await Promise.all([
      // uid 全部用 number 0 — NCM 库实际接受 number,跟下面 likelist/userPlaylist/userRecord
      // 保持一致;之前这里 '0' (string) 是 schema 漏配
      callNcm(() => userDetail(this.withCookie({ uid: 0 })), userDetailBodySchema, 'userDetail'),
      callNcm(() => likelist(this.withCookie({ uid: 0 })), likelistBodySchema, 'likelist'),
      callNcm(
        () => userPlaylist(this.withCookie({ uid: 0, limit: 200 })),
        userPlaylistBodySchema,
        'userPlaylist',
      ),
      callNcm(() => recommendSongs(this.withCookie({})), recommendBodySchema, 'recommendSongs'),
      callNcm(() => stylePreference(this.withCookie({})), stylePrefBodySchema, 'stylePreference'),
      callNcm(
        () => userRecord(this.withCookie({ uid: 0, type: 1 })),
        userRecordBodySchema,
        'userRecord',
      ),
      callNcm(() => userCloud(this.withCookie({})), userCloudBodySchema, 'userCloud'),
    ])
    return { detail, like, play, rec, style, record, cloud }
  }

  private assembleSnapshot(raw: SnapshotRaw): NcmUserSnapshot {
    const profile = raw.detail.profile
    if (profile === undefined) {
      throw new ExternalServiceError('NCM', 'fetchUserSnapshot: no profile in response')
    }
    return {
      userId: String(profile.userId),
      userName: profile.nickname,
      vipType: profile.vipType ?? 0,
      level: raw.detail.level ?? 0,
      likedSongIds: collectLikedIds(raw),
      playlists: mapPlaylists(raw.play.playlist ?? [], profile.userId),
      dailyRecommendations: (raw.rec.data?.dailySongs ?? []).map(rawToSong),
      heartMode: [],
      stylePreferences: (raw.style.data?.TAGS ?? []).map((t) => t.tagName),
      recentPlayed: mapRecentPlayed(raw.record),
      fmTrashSongIds: [],
      snapshotAtMs: this.clock.nowMs(),
    }
  }
}

// NCM code 约定: 800 二维码过期 / 801 等待扫码 / 802 已扫码待确认 / 803 授权成功
function interpretQrCheck(body: z.infer<typeof qrCheckBodySchema>): NcmLoginQrStatus {
  switch (body.code) {
    case 800:
      return { state: 'expired' }
    case 801:
      return { state: 'pending' }
    case 802:
      return { state: 'scanned' }
    case 803:
      if (body.cookie === undefined) {
        throw new ExternalServiceError('NCM', 'qrCheck 803 but no cookie')
      }
      return { state: 'success', cookie: body.cookie }
    default:
      throw new ExternalServiceError('NCM', `qrCheck unknown code ${String(body.code)}`)
  }
}

type SnapshotRaw = {
  detail: z.infer<typeof userDetailBodySchema>
  like: z.infer<typeof likelistBodySchema>
  play: z.infer<typeof userPlaylistBodySchema>
  rec: z.infer<typeof recommendBodySchema>
  style: z.infer<typeof stylePrefBodySchema>
  record: z.infer<typeof userRecordBodySchema>
  cloud: z.infer<typeof userCloudBodySchema>
}

function collectLikedIds(raw: SnapshotRaw): readonly SongId[] {
  const fromList = (raw.like.ids ?? []).map((n) => toSongId(String(n)))
  const fromCloud = (raw.cloud.data ?? []).map((c) => toSongId(String(c.songId)))
  return Array.from(new Set([...fromList, ...fromCloud]))
}

function mapRecentPlayed(
  record: z.infer<typeof userRecordBodySchema>,
): readonly { songId: SongId; playCount: number }[] {
  return (record.weekData ?? []).map((w) => ({
    songId: toSongId(String(w.song.id)),
    playCount: w.playCount,
  }))
}

function mapPlaylists(
  raw: readonly RawPlaylistEntry[],
  selfUserId: number,
): readonly NcmPlaylistMeta[] {
  return raw.map((p) => {
    const meta = {
      id: toPlaylistId(String(p.id)),
      name: p.name,
      songCount: p.trackCount,
      isCreated: p.userId === selfUserId,
    }
    return p.coverImgUrl !== undefined ? { ...meta, coverUrl: p.coverImgUrl } : meta
  })
}
