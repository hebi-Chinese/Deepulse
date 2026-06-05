/* eslint-disable @typescript-eslint/require-await -- test fakes intentionally stub Promises without await */
import { describe, expect, it } from 'vitest'

import { runDjTurn, type DjTurnEvent, type RunDjTurnDeps } from './run-dj-turn.js'

import type {
  ConversationEntry,
  IBrain,
  IClock,
  IConversationsRepo,
  ITtsClient,
  IUserPrefsRepo,
  UserPrefs,
} from '../../ports/index.js'

// ─── Fakes ─────────────────────────────────────────────────────────────

function fakeClock(): IClock {
  let t = 1_700_000_000_000
  return {
    nowMs: () => {
      t += 1
      return t
    },
  }
}

function fakeConversations(): IConversationsRepo {
  return {
    append: async () => undefined,
    recent: async () => [] as readonly ConversationEntry[],
  }
}

function fakePrefs(): IUserPrefsRepo {
  return {
    load: async (): Promise<UserPrefs> => ({ longTerm: '', shortTerm: '' }),
  }
}

function brainStreaming(tokens: readonly string[]): IBrain {
  return {
    stream: async function* () {
      for (const t of tokens) yield t
    },
    generateJson: async () => {
      throw new Error('not used')
    },
  }
}

// TTS that resolves immediately
function ttsInstant(): ITtsClient {
  return {
    synthesize: async (req) => ({ audioUrl: `mock://${req.text}` }),
  }
}

// TTS with controllable delay per sentence (by-key)
function ttsDelayed(delays: Map<string, number>): ITtsClient {
  return {
    synthesize: async (req) => {
      const ms = delays.get(req.text) ?? 0
      await new Promise<void>((r) => setTimeout(r, ms))
      return { audioUrl: `mock://${req.text}` }
    },
  }
}

function baseDeps(brain: IBrain, tts: ITtsClient): RunDjTurnDeps {
  return {
    brain,
    tts,
    conversations: fakeConversations(),
    userPrefs: fakePrefs(),
    clock: fakeClock(),
  }
}

async function collect(iter: AsyncIterable<DjTurnEvent>): Promise<readonly DjTurnEvent[]> {
  const out: DjTurnEvent[] = []
  for await (const ev of iter) out.push(ev)
  return out
}

// ─── tests ────────────────────────────────────────────────────────────

describe('runDjTurn', () => {
  it('emits turn_start, token, sentence, audio, reply_done for a 1-sentence reply', async () => {
    const brain = brainStreaming(['你好', '。'])
    const deps = baseDeps(brain, ttsInstant())
    const events = await collect(
      runDjTurn(deps, {
        turnId: 't1',
        userText: 'hi',
        signal: new AbortController().signal,
      }),
    )

    const types = events.map((e) => e.type)
    expect(types[0]).toBe('turn_start')
    expect(types).toContain('sentence')
    expect(types).toContain('audio')
    expect(types).toContain('reply_done')

    const sentence = events.find((e) => e.type === 'sentence')
    expect(sentence).toMatchObject({ type: 'sentence', idx: 0, text: '你好。' })

    const audio = events.find((e) => e.type === 'audio')
    expect(audio).toMatchObject({ type: 'audio', sentenceIdx: 0, url: 'mock://你好。' })
  })

  it('emits audio events interleaved (not batched at end) when TTS resolves during stream', async () => {
    // sentence 1 TTS resolves fast, sentence 2 brain token arrives later
    const brain: IBrain = {
      stream: async function* () {
        yield '第一句。'
        // give TTS time to settle before next token
        await new Promise<void>((r) => setTimeout(r, 30))
        yield '第二句。'
      },
      generateJson: async () => {
        throw new Error('not used')
      },
    }
    const tts = ttsDelayed(
      new Map([
        ['第一句。', 0],
        ['第二句。', 0],
      ]),
    )
    const events = await collect(
      runDjTurn(baseDeps(brain, tts), {
        turnId: 't1',
        userText: 'hi',
        signal: new AbortController().signal,
      }),
    )

    // sentence 1 audio MUST appear before sentence 2 event (interleaved, not batched)
    const idxAudio1 = events.findIndex((e) => e.type === 'audio' && e.sentenceIdx === 0)
    const idxSentence2 = events.findIndex((e) => e.type === 'sentence' && e.idx === 1)
    expect(idxAudio1).toBeGreaterThanOrEqual(0)
    expect(idxSentence2).toBeGreaterThan(idxAudio1)
  })

  it('continues turn when TTS for a sentence fails (single sentence silent, others fine)', async () => {
    const brain = brainStreaming(['好的。', '没问题。'])
    const tts: ITtsClient = {
      synthesize: async (req) => {
        if (req.text === '好的。') throw new Error('tts crashed')
        return { audioUrl: `mock://${req.text}` }
      },
    }
    const warns: { msg: string; err: unknown }[] = []
    const deps: RunDjTurnDeps = {
      ...baseDeps(brain, tts),
      log: { warn: (msg, err) => warns.push({ msg, err }) },
    }
    const events = await collect(
      runDjTurn(deps, {
        turnId: 't1',
        userText: 'hi',
        signal: new AbortController().signal,
      }),
    )

    const audios = events.filter((e) => e.type === 'audio')
    expect(audios).toHaveLength(1)
    expect(audios[0]).toMatchObject({ sentenceIdx: 1 })

    expect(warns.some((w) => w.msg.includes('tts failed for sentence 0'))).toBe(true)
    // turn 完成正常 (reply_done 仍然 yield)
    expect(events.some((e) => e.type === 'reply_done')).toBe(true)
  })

  it('emits error event and stops when brain throws', async () => {
    const brain: IBrain = {
      stream: async function* () {
        yield '开始'
        throw new Error('brain blew up')
      },
      generateJson: async () => {
        throw new Error('not used')
      },
    }
    const events = await collect(
      runDjTurn(baseDeps(brain, ttsInstant()), {
        turnId: 't1',
        userText: 'hi',
        signal: new AbortController().signal,
      }),
    )

    const errEv = events.find((e) => e.type === 'error')
    expect(errEv).toMatchObject({ type: 'error', msg: 'brain blew up' })
    // 不应继续 yield reply_done
    expect(events.some((e) => e.type === 'reply_done')).toBe(false)
  })

  it('stops gracefully when signal aborts mid-stream (no error event, no reply_done)', async () => {
    const ctl = new AbortController()
    const brain: IBrain = {
      stream: async function* () {
        yield '第一'
        ctl.abort() // abort 自己
        yield '不应该被消费的 token。'
      },
      generateJson: async () => {
        throw new Error('not used')
      },
    }
    const events = await collect(
      runDjTurn(baseDeps(brain, ttsInstant()), {
        turnId: 't1',
        userText: 'hi',
        signal: ctl.signal,
      }),
    )
    // abort 后不应有 reply_done / error
    expect(events.some((e) => e.type === 'reply_done')).toBe(false)
    expect(events.some((e) => e.type === 'error')).toBe(false)
  })
})
