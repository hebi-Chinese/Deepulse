'use client'

import type { ApiSong } from '../../lib/api'

type Props = {
  readonly query: string
  readonly onQueryChange: (q: string) => void
  readonly onSubmit: () => void
  readonly searching: boolean
  readonly results: readonly ApiSong[]
  readonly onPlay: (song: ApiSong) => void
  readonly onEnqueue: (song: ApiSong) => void
}

export function SearchPanel(props: Props) {
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          props.onSubmit()
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={props.query}
          onChange={(e) => {
            props.onQueryChange(e.target.value)
          }}
          placeholder="搜歌名 / 歌手"
          className="flex-1 px-4 py-2.5 rounded-xl bg-black/20 text-white placeholder:text-white/40 outline-none border border-white/10 focus:border-white/30 focus:bg-black/30 transition-colors"
        />
        <button
          type="submit"
          disabled={props.searching}
          className="px-5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-medium disabled:opacity-50 transition-colors border border-white/15"
        >
          {props.searching ? '搜索中…' : '搜索'}
        </button>
      </form>

      {props.results.length > 0 ? (
        <ul className="mt-4 space-y-0.5">
          {props.results.map((song) => (
            <SearchResultRow
              key={song.id}
              song={song}
              onPlay={props.onPlay}
              onEnqueue={props.onEnqueue}
            />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function SearchResultRow(props: {
  readonly song: ApiSong
  readonly onPlay: (song: ApiSong) => void
  readonly onEnqueue: (song: ApiSong) => void
}) {
  const { song } = props
  return (
    <li className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/8 group transition-colors">
      {song.coverUrl !== undefined ? (
        <img src={song.coverUrl} alt="" className="w-10 h-10 rounded-md object-cover" />
      ) : (
        <div className="w-10 h-10 rounded-md bg-white/8" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate text-white/90">{song.title}</div>
        <div className="text-xs text-white/50 truncate">
          {song.artists.map((a) => a.name).join(' · ')}
          {song.album !== undefined ? ` — ${song.album.name}` : ''}
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
        <button
          type="button"
          onClick={() => {
            props.onPlay(song)
          }}
          className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white"
        >
          播放
        </button>
        <button
          type="button"
          onClick={() => {
            props.onEnqueue(song)
          }}
          className="text-xs px-2.5 py-1 rounded-md bg-white/8 hover:bg-white/15 text-white/80"
        >
          入列
        </button>
      </div>
    </li>
  )
}
