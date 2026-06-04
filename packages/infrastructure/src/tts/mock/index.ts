// Mock TTS · 无 TTS server 也能跑全链路 (fork 者首次 demo / CI)
// 返回一个 1 秒的静音 wav data URI, audio 元素能正常 play 但听不到声
//
// 不在控制台 spam log: 一次 warn 标识当前是 mock 模式即可

import type { ITtsClient, TtsSynthesizeRequest, TtsSynthesizeResult } from '@claudio/application'

// 1 秒 mono 16-bit 22050Hz 静音 wav, base64 内联 (~860 字节)
const SILENT_WAV_DATA_URI = buildSilentWavDataUri()

export class MockTtsClient implements ITtsClient {
  private warned = false

  constructor(private readonly logger?: { readonly warn: (msg: string) => void }) {}

  async synthesize(_req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    if (!this.warned) {
      this.warned = true
      this.logger?.warn(
        '[tts] using MockTtsClient (silent wav). Set TTS_TYPE=gpt-sovits + TTS_URL to enable real TTS.',
      )
    }
    return await Promise.resolve({ audioUrl: SILENT_WAV_DATA_URI })
  }
}

function buildSilentWavDataUri(): string {
  // WAV header (44 bytes) + 22050 zero samples * 2 bytes = 44144 bytes
  const sampleRate = 22050
  const numSamples = sampleRate // 1 秒
  const bytesPerSample = 2
  const numChannels = 1
  const byteRate = sampleRate * numChannels * bytesPerSample
  const dataSize = numSamples * numChannels * bytesPerSample
  const buf = Buffer.alloc(44 + dataSize)
  // RIFF header
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  // fmt chunk
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16) // fmt chunk size
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(numChannels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(byteRate, 28)
  buf.writeUInt16LE(numChannels * bytesPerSample, 32) // block align
  buf.writeUInt16LE(bytesPerSample * 8, 34) // bits per sample
  // data chunk
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  // samples 默认 0
  return `data:audio/wav;base64,${buf.toString('base64')}`
}
