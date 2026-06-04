// 文件系统实现 IUserPrefsRepo
// 读 dataDir 下的 long-term.md / short-term.md
//   - long-term: 主人手写 markdown, 整段返出 (但有 8KB cap, 防误塞大文件)
//   - short-term: 每行 `YYYY-MM-DD: 描述`, 自动滤掉 > TTL_DAYS 的旧行
//
// SECURITY: 这两份文件的内容会直接拼入 LLM system prompt.
// 当前信任边界 = "本机文件系统手写". 如果未来加任何"DJ 自动写 prefs"路径,
// 必须先做 inline-action 标签剥离 / 大小限制 / 角色提示词逃逸检测.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { IUserPrefsRepo, UserPrefs } from '@claudio/application'

const TTL_DAYS = 7
const MAX_BYTES_PER_FILE = 8 * 1024

export type FilesystemUserPrefsRepoConfig = {
  /** 喜好文件目录绝对路径, 由 composition 注入 (不依赖 process.cwd()) */
  readonly dataDir: string
  /** 警告日志 (文件缺失 / 超长截断), 由 composition 注入 */
  readonly warn?: (msg: string) => void
}

export function createFilesystemUserPrefsRepo(cfg: FilesystemUserPrefsRepoConfig): IUserPrefsRepo {
  return {
    async load(nowMs: number): Promise<UserPrefs> {
      const [longTerm, shortTerm] = await Promise.all([
        readSafeCapped(join(cfg.dataDir, 'long-term.md'), cfg.warn),
        readSafeCapped(join(cfg.dataDir, 'short-term.md'), cfg.warn),
      ])
      return {
        longTerm,
        shortTerm: filterExpiredEntries(shortTerm, nowMs),
      }
    },
  }
}

// 用 UTF-8 字节数判断/切片 (中文 1 字符 = 3 字节, content.length 是 UTF-16 单元数会算少)
// TextDecoder fatal:false 会用 替换不完整 UTF-8 序列, 不会在多字节中间截断字符
async function readSafeCapped(path: string, warn?: (msg: string) => void): Promise<string> {
  try {
    const content = await readFile(path, 'utf8')
    const bytes = Buffer.byteLength(content, 'utf8')
    if (bytes > MAX_BYTES_PER_FILE) {
      warn?.(
        `[user-prefs] ${path} ${String(bytes)}B > ${String(MAX_BYTES_PER_FILE)}B cap, truncating`,
      )
      const buf = Buffer.from(content, 'utf8').subarray(0, MAX_BYTES_PER_FILE)
      return new TextDecoder('utf-8', { fatal: false }).decode(buf)
    }
    return content
  } catch (err: unknown) {
    warn?.(`[user-prefs] missing ${path}, using empty: ${getErrorMessage(err)}`)
    return ''
  }
}

// nowMs 注入而不是直接 Date.now() — 让函数可单测时间分支
// trimStart() 有意为之: 主人在 markdown 列表里写 `- 2026-05-30: xxx`, regex 已用 `(?:-\s*)?`
// 但兼容 `  2026-...` (额外空格) 还得先 trimStart 再匹配
export function filterExpiredEntries(content: string, nowMs: number): string {
  if (content === '') return ''
  const cutoffMs = nowMs - TTL_DAYS * 86_400_000
  const dateLineRe = /^(?:-\s*)?(\d{4})-(\d{2})-(\d{2})(?::|\s)/
  return content
    .split('\n')
    .filter((line) => {
      const m = dateLineRe.exec(line.trimStart())
      if (m === null) return true
      const [, y, mo, d] = m
      const entryMs = Date.UTC(Number(y), Number(mo) - 1, Number(d))
      return entryMs >= cutoffMs
    })
    .join('\n')
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
