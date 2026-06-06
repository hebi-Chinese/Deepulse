'use client'

import { useState } from 'react'

import type { ApiSong } from '../../lib/api'

type Props = {
  readonly queue: readonly ApiSong[]
  readonly currentIndex: number
  // 点队列里某首 = 直接跳到那首播 (复用 playSong, 它对已有项做"jump to index")
  readonly onJump: (song: ApiSong) => void
  readonly onRemove: (id: string) => void
  readonly onMove: (fromId: string, toId: string) => void
  readonly onClear: () => void
}

export function QueuePanel(props: Props) {
  const [dragId, setDragId] = useState<string | null>(null)
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium tracking-widest text-white/55 uppercase">
          播放队列 · {props.queue.length}
        </div>
        {props.queue.length > 0 ? (
          <button
            type="button"
            onClick={props.onClear}
            className="text-[10px] tracking-widest text-white/40 hover:text-red-300/80 uppercase"
            title="清空(保留当前播放)"
          >
            清空
          </button>
        ) : null}
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
              isDragging={dragId === song.id}
              onJump={props.onJump}
              onRemove={props.onRemove}
              onDragStart={() => {
                setDragId(song.id)
              }}
              onDragEnd={() => {
                setDragId(null)
              }}
              onDropOn={(toId) => {
                if (dragId !== null && dragId !== toId) props.onMove(dragId, toId)
                setDragId(null)
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

type RowProps = {
  readonly song: ApiSong
  readonly index: number
  readonly isCurrent: boolean
  readonly isDragging: boolean
  readonly onJump: (song: ApiSong) => void
  readonly onRemove: (id: string) => void
  readonly onDragStart: () => void
  readonly onDragEnd: () => void
  readonly onDropOn: (toId: string) => void
}

function QueueRow(p: RowProps) {
  const [dragOver, setDragOver] = useState(false)
  const dragHandlers = useRowDragHandlers(p, dragOver, setDragOver)
  return (
    <li draggable {...dragHandlers} className={rowClass(p.isCurrent, p.isDragging, dragOver)}>
      <span className="text-[10px] text-white/40 w-5 tabular-nums select-none">
        {p.isCurrent ? '▶' : p.index + 1}
      </span>
      <button
        type="button"
        onClick={() => {
          if (!p.isCurrent) p.onJump(p.song)
        }}
        className="flex-1 min-w-0 text-left rounded px-1 -mx-1 hover:bg-white/4 disabled:hover:bg-transparent"
        disabled={p.isCurrent}
        title={p.isCurrent ? '正在播放' : '播放这首'}
      >
        <div className="truncate">{p.song.title}</div>
        <div className="text-xs text-white/40 truncate">
          {p.song.artists.map((a) => a.name).join(', ')}
        </div>
      </button>
      <button
        type="button"
        onClick={() => {
          p.onRemove(p.song.id)
        }}
        className="opacity-0 group-hover:opacity-100 text-xs text-white/40 hover:text-red-300 transition-opacity"
        title="从队列移除"
      >
        ✕
      </button>
    </li>
  )
}

function useRowDragHandlers(
  p: RowProps,
  dragOver: boolean,
  setDragOver: (v: boolean) => void,
): {
  readonly onDragStart: (e: React.DragEvent) => void
  readonly onDragEnd: () => void
  readonly onDragOver: (e: React.DragEvent) => void
  readonly onDragLeave: () => void
  readonly onDrop: (e: React.DragEvent) => void
} {
  return {
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move'
      p.onDragStart()
    },
    onDragEnd: p.onDragEnd,
    onDragOver: (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (!dragOver) setDragOver(true)
    },
    onDragLeave: () => {
      setDragOver(false)
    },
    onDrop: (e) => {
      e.preventDefault()
      setDragOver(false)
      p.onDropOn(p.song.id)
    },
  }
}

function rowClass(isCurrent: boolean, isDragging: boolean, dragOver: boolean): string {
  const base =
    'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm group transition-colors cursor-grab active:cursor-grabbing'
  const tone = isCurrent ? 'bg-white/12 text-white' : 'hover:bg-white/6 text-white/75'
  const dragOpacity = isDragging ? 'opacity-40' : ''
  const dropRing = dragOver ? 'ring-1 ring-white/40 ring-inset' : ''
  return `${base} ${tone} ${dragOpacity} ${dropRing}`
}
