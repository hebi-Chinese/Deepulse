// SentenceSegmenter · Brain 流式 token 累积,按中英句末标点切句
// push(token) → 返回这一 chunk 后**新完成**的整句数组 (可能为空)
// flush() → 在流结束时返回剩下的不完整尾巴 (调用方决定要不要发 TTS)
//
// 用法:
//   const seg = new SentenceSegmenter()
//   for await (const t of stream) for (const s of seg.push(t)) await tts(s)
//   const tail = seg.flush(); if (tail) await tts(tail)

const SENTENCE_END = /[。？！?!；;\n]/

export class SentenceSegmenter {
  private buf = ''

  push(token: string): readonly string[] {
    this.buf += token
    const done: string[] = []
    let match = SENTENCE_END.exec(this.buf)
    while (match !== null) {
      const end = match.index + match[0].length
      const sentence = this.buf.slice(0, end).trim()
      this.buf = this.buf.slice(end)
      if (sentence.length > 0) done.push(sentence)
      match = SENTENCE_END.exec(this.buf)
    }
    return done
  }

  flush(): string {
    const tail = this.buf.trim()
    this.buf = ''
    return tail
  }
}
