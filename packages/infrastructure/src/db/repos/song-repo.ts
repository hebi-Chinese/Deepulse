/* eslint-disable @typescript-eslint/require-await -- better-sqlite3 is sync */
// SongRepo · 缓存 NCM 歌曲元数据

import { toAlbumId, toArtistId, toSongId, ValidationError } from '@claudio/domain'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { songs, type DbSong } from '../schema.js'

import type { DbClient } from '../client.js'
import type { ISongRepo } from '@claudio/application'
import type { Song, SongId } from '@claudio/domain'

const artistsJsonSchema = z.array(z.object({ id: z.string(), name: z.string() }))

function parseArtists(raw: string, songId: string): readonly { id: string; name: string }[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new ValidationError(`song ${songId} artistsJson is not JSON`, { cause: err })
  }
  const validated = artistsJsonSchema.safeParse(parsed)
  if (!validated.success) {
    throw new ValidationError(
      `song ${songId} artistsJson shape invalid: ${validated.error.message}`,
    )
  }
  return validated.data
}

function dbRowToSong(row: DbSong): Song {
  const artists = parseArtists(row.artistsJson, row.id).map((a) => ({
    id: toArtistId(a.id),
    name: a.name,
  }))
  const base = {
    id: toSongId(row.id),
    ncmId: row.ncmId,
    title: row.title,
    artists,
    durationMs: row.durationMs,
  }
  const withAlbum =
    row.albumId !== null && row.albumName !== null
      ? { ...base, album: { id: toAlbumId(row.albumId), name: row.albumName } }
      : base
  return row.coverUrl !== null ? { ...withAlbum, coverUrl: row.coverUrl } : withAlbum
}

function songToValues(song: Song): {
  artistsJson: string
  albumId: string | null
  albumName: string | null
  coverUrl: string | null
} {
  return {
    artistsJson: JSON.stringify(song.artists.map((a) => ({ id: a.id, name: a.name }))),
    albumId: song.album?.id ?? null,
    albumName: song.album?.name ?? null,
    coverUrl: song.coverUrl ?? null,
  }
}

export function createSongRepo(client: DbClient): ISongRepo {
  return {
    async findById(id: SongId): Promise<Song | null> {
      const rows = client.db.select().from(songs).where(eq(songs.id, id)).all()
      const row = rows[0]
      return row !== undefined ? dbRowToSong(row) : null
    },

    async upsert(song: Song): Promise<void> {
      const vals = songToValues(song)
      client.db
        .insert(songs)
        .values({
          id: song.id,
          ncmId: song.ncmId,
          title: song.title,
          durationMs: song.durationMs,
          ...vals,
        })
        .onConflictDoUpdate({
          target: songs.id,
          set: { title: song.title, durationMs: song.durationMs, ...vals },
        })
        .run()
    },
  }
}
