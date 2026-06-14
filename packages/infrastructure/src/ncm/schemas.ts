// NCM 响应 body 的 zod schema · 单一真相源
// 类型从 schema 推导 (z.infer),不再 hand-roll TS type + as 断言
// 文档约定: 顶层是 { status, body },status 由 call.ts 统一校验,这里只管 body shape

import { z } from 'zod'

export const rawSongSchema = z.object({
  id: z.number(),
  name: z.string(),
  ar: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  al: z
    .object({
      id: z.number(),
      name: z.string(),
      picUrl: z.string().optional(),
    })
    .optional(),
  dt: z.number().optional(),
})
export type RawSong = z.infer<typeof rawSongSchema>

export const searchBodySchema = z.object({
  result: z
    .object({
      songs: z.array(rawSongSchema).optional(),
    })
    .optional(),
})

export const songUrlBodySchema = z.object({
  data: z.array(z.object({ url: z.string().nullable() })).optional(),
})

export const lyricBodySchema = z.object({
  lrc: z.object({ lyric: z.string().optional() }).optional(),
  tlyric: z.object({ lyric: z.string().optional() }).optional(),
  yrc: z.object({ lyric: z.string().optional() }).optional(),
})

export const suggestBodySchema = z.object({
  result: z
    .object({
      songs: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
      artists: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
    })
    .optional(),
})

export const recommendBodySchema = z.object({
  data: z
    .object({
      dailySongs: z.array(rawSongSchema).optional(),
    })
    .optional(),
})

export const fmBodySchema = z.object({
  data: z.array(rawSongSchema).optional(),
})

// playlist_track_all 调 /playlist/track/all (内部还会调一次 song/detail 拿 song 信息),
// 顶层 body 含 songs 数组,shape 跟 rawSongSchema 一致
export const playlistTracksBodySchema = z.object({
  songs: z.array(rawSongSchema).optional(),
})

export const intelligenceBodySchema = z.object({
  data: z.array(z.object({ songInfo: rawSongSchema.optional() })).optional(),
})

export const toplistBodySchema = z.object({
  playlist: z.object({ tracks: z.array(rawSongSchema).optional() }).optional(),
})

export const likelistBodySchema = z.object({
  ids: z.array(z.number()).optional(),
})

export const userPlaylistBodySchema = z.object({
  playlist: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        trackCount: z.number(),
        coverImgUrl: z.string().optional(),
        userId: z.number(),
      }),
    )
    .optional(),
})
export type RawPlaylistEntry = NonNullable<
  z.infer<typeof userPlaylistBodySchema>['playlist']
>[number]

export const userDetailBodySchema = z.object({
  profile: z
    .object({
      userId: z.number(),
      nickname: z.string(),
      vipType: z.number().optional(),
    })
    .optional(),
  level: z.number().optional(),
})

export const userRecordBodySchema = z.object({
  weekData: z
    .array(
      z.object({
        playCount: z.number(),
        song: z.object({ id: z.number() }),
      }),
    )
    .optional(),
})

export const userCloudBodySchema = z.object({
  data: z.array(z.object({ songId: z.number() })).optional(),
})

export const stylePrefBodySchema = z.object({
  data: z
    .object({
      TAGS: z.array(z.object({ tagName: z.string() })).optional(),
    })
    .optional(),
})

export const qrKeyBodySchema = z.object({
  data: z.object({ unikey: z.string().optional() }).optional(),
})

export const qrCreateBodySchema = z.object({
  data: z.object({ qrimg: z.string().optional() }).optional(),
})

export const qrCheckBodySchema = z.object({
  code: z.number(),
  cookie: z.string().optional(),
})

// like / fmTrash 这类只关心 status,body 不读
export const genericBodySchema = z.unknown()

// song/detail 批量接口 body shape (PRD-005: cold-start hydrate)
// 顶层 { songs: RawSong[], privileges: ... }, 只关心 songs
export const songDetailBodySchema = z.object({
  songs: z.array(rawSongSchema).optional(),
})
