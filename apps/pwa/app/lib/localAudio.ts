// localAudio · 把 File 解析成 ApiSong + blob URL
// 用 music-metadata 读 ID3v2 / Vorbis / MP4 tag,fallback 用文件名

import { parseBlob } from 'music-metadata'

import type { ApiSong } from './api'

export async function parseLocalFile(file: File, idx: number): Promise<ApiSong> {
  const localUrl = URL.createObjectURL(file)
  const id = `local-${String(Date.now())}-${String(idx)}`
  try {
    const meta = await parseBlob(file)
    return {
      id,
      ncmId: id,
      title: meta.common.title ?? stripExt(file.name),
      artists:
        meta.common.artists !== undefined && meta.common.artists.length > 0
          ? meta.common.artists.map((name, i) => ({ id: `local-ar-${String(i)}`, name }))
          : meta.common.artist !== undefined
            ? [{ id: 'local-ar-0', name: meta.common.artist }]
            : [{ id: 'local-ar-0', name: '本地音乐' }],
      album:
        meta.common.album !== undefined ? { id: 'local-al-0', name: meta.common.album } : undefined,
      durationMs: meta.format.duration !== undefined ? Math.round(meta.format.duration * 1000) : 0,
      coverUrl: extractCoverUrl(meta.common.picture),
      localUrl,
    }
  } catch {
    // 没 tag / 解析失败 — 文件名兜底,照样可播
    return {
      id,
      ncmId: id,
      title: stripExt(file.name),
      artists: [{ id: 'local-ar-0', name: '本地音乐' }],
      durationMs: 0,
      localUrl,
    }
  }
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

type Picture = { format: string; data: Uint8Array }

function extractCoverUrl(pictures: readonly Picture[] | undefined): string | undefined {
  const pic = pictures?.[0]
  if (pic === undefined) return undefined
  // 转 data URL 给 <img src 用
  const blob = new Blob([new Uint8Array(pic.data)], { type: pic.format })
  return URL.createObjectURL(blob)
}

// 入口: 用户选了多个文件 -> 解析全部,返回 ApiSong[]
// 失败的单个文件被跳过 (catch in parseLocalFile),不阻塞其他
export async function parseLocalFiles(files: readonly File[]): Promise<readonly ApiSong[]> {
  const results = await Promise.all(files.map((f, i) => parseLocalFile(f, i)))
  return results
}
