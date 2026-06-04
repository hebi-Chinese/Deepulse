'use client'

import type { ApiSong } from '../../lib/api'

type Props = {
  readonly queue: readonly ApiSong[]
  readonly currentIndex: number
  // 点队列里某首 = 直接跳到那首播 (复用 playSong, 它对已有项做"jump to index")
  readonly onJump: (song: ApiSong) => void
  readonly onRemove: (id: string) => void
}

export function QueuePanel(props: Props) {
  return (
    <div>
      <div className="text-xs font-medium tracking-widest text-white/55 uppercase mb-3">
        播放队列 · {props.queue.length}
      </div>
      {props.queue.length === 0 ? (
        <div className="text-white/40 text-sm font-light">空</div>
      ) : (
        <ul className="space-y-0.5 max-h-[28rem] overflow-y-auto">
          {props.queue.map((song, idx) => (
            <QueueRow
              key={song.id}
              song={song}
              index={idx}
              isCurrent={idx === props.currentIndex}
              onJump={props.onJump}
              onRemove={props.onRemove}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function QueueRow(props: {
  readonly song: ApiSong
  readonly index: number
  readonly isCurrent: boolean
  readonly onJump: (song: ApiSong) => void
  readonly onRemove: (id: string) => void
}) {
  return (
    <li
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm group transition-colors ${
        props.isCurrent ? 'bg-white/12 text-white' : 'hover:bg-white/6 text-white/75'
      }`}
    >
      <span className="text-[10px] text-white/40 w-5 tabular-nums">
        {props.isCurrent ? '▶' : props.index + 1}
      </span>
      {/* 整个标题区可点 → 跳到这首播 */}
      <button
        type="button"
        onClick={() => {
          if (!props.isCurrent) props.onJump(props.song)
        }}
        className="flex-1 min-w-0 text-left cursor-pointer rounded px-1 -mx-1 hover:bg-white/4 disabled:cursor-default disabled:hover:bg-transparent"
        disabled={props.isCurrent}
        title={props.isCurrent ? '正在播放' : '播放这首'}
      >
        <div className="truncate">{props.song.title}</div>
        <div className="text-xs text-white/40 truncate">
          {props.song.artists.map((a) => a.name).join(', ')}
        </div>
      </button>
      <button
        type="button"
        onClick={() => {
          props.onRemove(props.song.id)
        }}
        className="opacity-0 group-hover:opacity-100 text-xs text-white/40 hover:text-red-300 transition-opacity"
        title="从队列移除"
      >
        ✕
      </button>
    </li>
  )
}
