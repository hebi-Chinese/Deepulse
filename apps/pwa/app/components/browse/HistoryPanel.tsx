'use client'

// HistoryPanel · Browse 板块, 最近播放历史
// 拉 /api/plays/recent, 行点击 = 重新播放

import { useEffect, useState } from 'react'

import { api, type ApiPlayHistoryRow, type ApiSong } from '../../lib/api'

type Props = {
  readonly onPlay: (song: ApiSong) => void
  readonly currentSongId?: string
}

const FETCH_LIMIT = 30

export function HistoryPanel({ onPlay, currentSongId }: Props) {
  const [rows, setRows] = useState<readonly ApiPlayHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .recentPlays(FETCH_LIMIT)
      .then((r) => {
        if (cancelled) return
        setRows(r.plays)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setErr(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <div className="text-xs font-medium tracking-widest text-white/55 uppercase mb-3">
        最近播放
      </div>
      {loading ? <div className="text-white/40 text-sm font-light">加载中...</div> : null}
      {err !== null ? <div className="text-red-300/70 text-xs">{err}</div> : null}
      {!loading && err === null && rows.length === 0 ? (
        <div className="text-white/40 text-sm font-light">还没听过歌</div>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-0.5 max-h-[20rem] overflow-y-auto">
          {rows.map((row, idx) => (
            <HistoryRow
              key={`${row.song.id}-${String(row.playedAtMs)}`}
              row={row}
              index={idx}
              isCurrent={row.song.id === currentSongId}
              onPlay={onPlay}
            />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function HistoryRow({
  row,
  index,
  isCurrent,
  onPlay,
}: {
  readonly row: ApiPlayHistoryRow
  readonly index: number
  readonly isCurrent: boolean
  readonly onPlay: (s: ApiSong) => void
}) {
  return (
    <li
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm group transition-colors ${
        isCurrent ? 'bg-white/10 text-white' : 'hover:bg-white/6 text-white/75'
      }`}
    >
      <span className="text-[10px] text-white/40 w-5 tabular-nums">
        {isCurrent ? '▶' : index + 1}
      </span>
      <button
        type="button"
        onClick={() => {
          onPlay(row.song)
        }}
        className="flex-1 min-w-0 text-left rounded px-1 -mx-1 hover:bg-white/4"
        title={`重新播放 · ${formatRelative(row.playedAtMs)}`}
      >
        <div className="truncate">{row.song.title}</div>
        <div className="text-xs text-white/40 truncate flex items-center gap-1.5">
          <span className="truncate">{row.song.artists.map((a) => a.name).join(', ')}</span>
          <span className="text-white/30">·</span>
          <span className="text-white/35 shrink-0">{formatRelative(row.playedAtMs)}</span>
        </div>
      </button>
    </li>
  )
}

// 相对时间: <1min "刚刚" / <1h "N min" / <24h "N h" / 否则日期
function formatRelative(tsMs: number): string {
  const diff = Date.now() - tsMs
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${String(Math.floor(diff / 60_000))} 分钟前`
  if (diff < 86_400_000) return `${String(Math.floor(diff / 3_600_000))} 小时前`
  const d = new Date(tsMs)
  return `${String(d.getMonth() + 1)}/${String(d.getDate())}`
}
