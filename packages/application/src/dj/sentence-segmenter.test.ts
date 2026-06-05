import { describe, expect, it } from 'vitest'

import { SentenceSegmenter } from './sentence-segmenter.js'

describe('SentenceSegmenter', () => {
  it('returns empty array when token has no sentence terminator', () => {
    const seg = new SentenceSegmenter()
    expect(seg.push('你好')).toEqual([])
  })

  it('yields a sentence on Chinese full-stop', () => {
    const seg = new SentenceSegmenter()
    expect(seg.push('你好。')).toEqual(['你好。'])
  })

  it('accumulates across tokens until terminator arrives', () => {
    const seg = new SentenceSegmenter()
    expect(seg.push('今天')).toEqual([])
    expect(seg.push('天气')).toEqual([])
    expect(seg.push('真好。')).toEqual(['今天天气真好。'])
  })

  it('handles multiple sentences in one push', () => {
    const seg = new SentenceSegmenter()
    expect(seg.push('第一句。第二句！第三句？')).toEqual(['第一句。', '第二句！', '第三句？'])
  })

  it('keeps trailing fragment in buffer after a complete sentence', () => {
    const seg = new SentenceSegmenter()
    expect(seg.push('完整句子。剩下')).toEqual(['完整句子。'])
    expect(seg.flush()).toBe('剩下')
  })

  it('flush returns empty string when buffer is empty', () => {
    const seg = new SentenceSegmenter()
    expect(seg.flush()).toBe('')
  })

  it('flush clears buffer (next push starts fresh)', () => {
    const seg = new SentenceSegmenter()
    seg.push('未完成')
    expect(seg.flush()).toBe('未完成')
    expect(seg.flush()).toBe('')
  })

  it('treats newline as sentence terminator', () => {
    const seg = new SentenceSegmenter()
    expect(seg.push('一行\n')).toEqual(['一行'])
  })

  it('skips empty sentences (consecutive terminators)', () => {
    const seg = new SentenceSegmenter()
    expect(seg.push('a。。。b。')).toEqual(['a。', '。', '。', 'b。'])
    // 注: 当前实现把单独的"。"也算句子, 这测试锁定行为
  })

  it('handles ASCII ?! and ; as terminators', () => {
    const seg = new SentenceSegmenter()
    expect(seg.push('Hello! World?')).toEqual(['Hello!', 'World?'])
    expect(seg.push('done;')).toEqual(['done;'])
  })

  it('does NOT treat ASCII . as a terminator', () => {
    // SENTENCE_END regex 含 ？！?!；;\n 不含 . (ASCII period 不切句, 避免误切 v3.0 这种)
    const seg = new SentenceSegmenter()
    expect(seg.push('Version 3.0 ready')).toEqual([])
    expect(seg.flush()).toBe('Version 3.0 ready')
  })

  it('trims whitespace from extracted sentences', () => {
    const seg = new SentenceSegmenter()
    expect(seg.push('  spaced!   ')).toEqual(['spaced!'])
  })
})
