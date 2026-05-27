'use client'

// ImportButton · 顶栏 📁 按钮,选本地音乐 → 解析 tag → 入队 + 播放
// 选多个文件: 第一首立刻播 + 进 Listen,其余入队
// 失败提示在 console,主流程不打断

import { useRef } from 'react'

import { parseLocalFiles } from '../../lib/localAudio'

import type { ApiSong } from '../../lib/api'

type Props = {
  readonly title: string
  readonly onImport: (songs: readonly ApiSong[]) => void
}

export function ImportButton({ title, onImport }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  return (
    <>
      <button
        type="button"
        className="tool-btn"
        onClick={() => {
          inputRef.current?.click()
        }}
        aria-label={title}
        title={title}
      >
        📁
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.flac,.m4a,.ogg,.wav,.aac"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files
          if (files === null || files.length === 0) return
          void (async (): Promise<void> => {
            const songs = await parseLocalFiles(Array.from(files))
            onImport(songs)
            // 同一文件再次选可触发: 清空 value
            if (inputRef.current !== null) inputRef.current.value = ''
          })()
        }}
      />
    </>
  )
}
