import { describe, expect, it } from 'vitest'

import { parseInlineActions } from './protocol.js'

describe('parseInlineActions', () => {
  it('returns empty actions when text has no tags', () => {
    const r = parseInlineActions('就是一句普通的话')
    expect(r.cleaned).toBe('就是一句普通的话')
    expect(r.actions).toEqual([])
  })

  it('extracts a single play action with query', () => {
    const r = parseInlineActions('好的, 我给你放<<play:陶喆 蝴蝶>>')
    expect(r.actions).toEqual([{ kind: 'play', query: '陶喆 蝴蝶' }])
    expect(r.cleaned).toBe('好的, 我给你放')
  })

  it('extracts next without query', () => {
    const r = parseInlineActions('换一首<<next>>')
    expect(r.actions).toEqual([{ kind: 'next' }])
    expect(r.cleaned).toBe('换一首')
  })

  it('extracts queue action with query', () => {
    const r = parseInlineActions('稍后听<<queue:某首歌>>')
    expect(r.actions).toEqual([{ kind: 'queue', query: '某首歌' }])
    expect(r.cleaned).toBe('稍后听')
  })

  it('handles multiple tags in one string', () => {
    const r = parseInlineActions('<<play:A>>然后<<queue:B>>再<<next>>')
    expect(r.actions).toEqual([
      { kind: 'play', query: 'A' },
      { kind: 'queue', query: 'B' },
      { kind: 'next' },
    ])
    expect(r.cleaned).toBe('然后再')
  })

  it('ignores unknown action kinds (left in cleaned text)', () => {
    // 注意: 当前 regex 只 match (play|queue|next), 别的 tag 不会被 regex 捕获,
    // 留在 cleaned 里, 不报错 (parser 容错)
    const r = parseInlineActions('hi <<unknown:x>> bye')
    expect(r.actions).toEqual([])
    expect(r.cleaned).toBe('hi <<unknown:x>> bye')
  })

  it('empty query form (<<play:>>) does NOT match regex (silent skip)', () => {
    // TAG_RE 的 [^>]+ 要求 1+ 非 > 字符, 所以 <<play:>> 没人接, 整段留在 cleaned 里
    const r = parseInlineActions('<<play:>>')
    expect(r.actions).toEqual([])
    expect(r.cleaned).toBe('<<play:>>')
  })

  it('trims cleaned result', () => {
    const r = parseInlineActions('  <<next>>  ')
    expect(r.cleaned).toBe('')
    expect(r.actions).toEqual([{ kind: 'next' }])
  })
})
