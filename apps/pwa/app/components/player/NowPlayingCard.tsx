'use client'

import type { ApiSong } from '../../lib/api'
import type { LrcLine } from '../../lib/lrc'

type Props = {
  readonly song: ApiSong | undefined
  readonly lrcLines: readonly LrcLine[]
  readonly lrcLoading: boolean
  readonly activeLrcIndex: number
}

export function NowPlayingCard(props: Props) {
  return (
    <div>
      {props.song !== undefined ? (
        <div className="space-y-5">
          <SongHeader song={props.song} />
          <LyricsPane
            loading={props.lrcLoading}
            lines={props.lrcLines}
            activeIndex={props.activeLrcIndex}
          />
        </div>
      ) : (
        <div className="text-white/45 text-center py-16 font-light">搜索一首歌开始播放</div>
      )}
    </div>
  )
}

function SongHeader({ song }: { readonly song: ApiSong }) {
  return (
    <div className="flex items-center gap-5">
      {song.coverUrl !== undefined ? (
        <img
          src={song.coverUrl}
          alt=""
          className="w-28 h-28 rounded-xl object-cover shadow-2xl ring-1 ring-white/10"
        />
      ) : (
        <div className="w-28 h-28 rounded-xl bg-white/8" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-2xl font-light truncate text-white tracking-tight">{song.title}</div>
        <div className="text-sm text-white/65 truncate mt-1">
          {song.artists.map((a) => a.name).join(' · ')}
        </div>
        <div className="text-xs text-white/40 truncate mt-0.5">{song.album?.name ?? ''}</div>
      </div>
    </div>
  )
}

function LyricsPane(props: {
  readonly loading: boolean
  readonly lines: readonly LrcLine[]
  readonly activeIndex: number
}) {
  return (
    <div className="max-h-56 overflow-y-auto rounded-xl bg-black/20 p-5 text-base leading-relaxed border border-white/8">
      {props.loading ? (
        <div className="text-white/45 font-light">加载歌词中…</div>
      ) : props.lines.length === 0 ? (
        <div className="text-white/45 font-light">无歌词</div>
      ) : (
        props.lines.map((line, i) => (
          <div
            key={i}
            className={
              i === props.activeIndex
                ? 'text-white font-medium tracking-wide transition-colors'
                : 'text-white/35 transition-colors'
            }
          >
            {line.text}
          </div>
        ))
      )}
    </div>
  )
}
