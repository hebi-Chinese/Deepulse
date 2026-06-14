// 文件版长期记忆 — markdown 追加, 每行一条 distill entry
// 格式: `- [YYYY-MM-DD HH:MM] {summary}`
// 跨重启幸存. Redis 不在这里, 长期就是文件.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { ILongTermMemoryRepo, LongTermEntry } from '@deepulse/application'

const ENTRY_LINE_RE = /^- \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] (.+)$/

export type FilesystemLongTermConfig = {
  /** markdown 文件路径 (e.g. apps/server/data/dj-long-term.md) */
  readonly filePath: string
}

export function createFilesystemLongTermRepo(cfg: FilesystemLongTermConfig): ILongTermMemoryRepo {
  return {
    load: async () => {
      const raw = await safeRead(cfg.filePath)
      if (raw === null) return []
      return raw
        .split(/\r?\n/)
        .map(parseLine)
        .filter((e): e is LongTermEntry => e !== null)
    },
    append: async (entry) => {
      await mkdir(dirname(cfg.filePath), { recursive: true })
      const existing = (await safeRead(cfg.filePath)) ?? ''
      const next =
        existing.length > 0 && !existing.endsWith('\n')
          ? `${existing}\n${formatLine(entry)}\n`
          : `${existing}${formatLine(entry)}\n`
      await writeFile(cfg.filePath, next, 'utf-8')
    },
  }
}

// 只把"文件不存在"当 null, 其他 (权限/磁盘) 抛出去 — 否则 load 会静默返空,
// append 会基于空 base 重写, 数据丢光
async function safeRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null
    throw err
  }
}

function formatLine(entry: LongTermEntry): string {
  const d = new Date(entry.tsMs)
  const ts = `${d.getFullYear().toString()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  // 把 summary 内的换行打平 — 一行一条
  const flat = entry.summary.replace(/\s*\n\s*/g, ' ').trim()
  return `- [${ts}] ${flat}`
}

function pad(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n)
}

function parseLine(line: string): LongTermEntry | null {
  const m = ENTRY_LINE_RE.exec(line.trim())
  if (m === null) return null
  const dateStr = m[1]
  const summary = m[2]
  if (dateStr === undefined || summary === undefined) return null
  // "YYYY-MM-DD HH:MM" → Date
  const tsMs = Date.parse(`${dateStr.replace(' ', 'T')}:00`)
  if (Number.isNaN(tsMs)) return null
  return { tsMs, summary }
}
