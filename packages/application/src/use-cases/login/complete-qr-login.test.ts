/* eslint-disable @typescript-eslint/require-await -- test fakes intentionally stub Promises without await */
import { describe, expect, it, vi } from 'vitest'

import { completeQrLogin, type CompleteQrLoginDeps } from './complete-qr-login.js'

import type {
  IClock,
  INcmAccountRepo,
  INcmClient,
  INcmSnapshotRepo,
  NcmUserSnapshot,
} from '../../ports/index.js'

// ─── Fakes ─────────────────────────────────────────────────────────────

function fakeNcm(overrides: Partial<INcmClient> = {}): INcmClient {
  const calls = { setCookie: 0, lastCookie: '' as string }
  const obj: INcmClient = {
    setCookie: (c: string) => {
      calls.setCookie += 1
      calls.lastCookie = c
    },
    clearCookie: () => undefined,
    getCookie: () => undefined,
    search: vi.fn(),
    searchSuggest: vi.fn(),
    getSongUrl: vi.fn(),
    getLyric: vi.fn(),
    dailyRecommendations: vi.fn(),
    privateFm: vi.fn(),
    getMyPlaylists: vi.fn(),
    getPlaylistTracks: vi.fn(),
    heartMode: vi.fn(),
    toplist: vi.fn(),
    fmTrash: vi.fn(),
    like: vi.fn(),
    likedSongIds: vi.fn(),
    loginQrCreate: vi.fn(),
    loginQrCheck: vi.fn(),
    fetchUserSnapshot: vi.fn(async (): Promise<NcmUserSnapshot> => {
      throw new Error('not stubbed')
    }),
    ...overrides,
  } as INcmClient
  ;(obj as unknown as { _calls: typeof calls })._calls = calls
  return obj
}

function fakeAccount(saveImpl?: () => Promise<void>): INcmAccountRepo {
  return {
    saveCookie: saveImpl ?? (async () => undefined),
    loadCookie: async () => null,
    clear: async () => undefined,
  }
}

function fakeSnapshot(): INcmSnapshotRepo {
  return {
    save: async () => undefined,
    load: async () => null,
    status: async () => ({ exists: false, lastSnapshotAtMs: null }),
  }
}

const clock: IClock = { nowMs: () => 1_700_000_000_000 }

function deps(over: Partial<CompleteQrLoginDeps> = {}): CompleteQrLoginDeps {
  return {
    ncm: fakeNcm(),
    account: fakeAccount(),
    snapshot: fakeSnapshot(),
    clock,
    ...over,
  }
}

// ─── tests ────────────────────────────────────────────────────────────

describe('completeQrLogin', () => {
  it('always sets cookie in NCM memory', async () => {
    const ncm = fakeNcm()
    const result = await completeQrLogin(deps({ ncm }), {
      cookie: 'abc',
      persist: false,
    })
    expect(result.ok).toBe(true)
    expect(
      (ncm as unknown as { _calls: { setCookie: number; lastCookie: string } })._calls,
    ).toMatchObject({
      setCookie: 1,
      lastCookie: 'abc',
    })
  })

  it('persists cookie when persist=true and save succeeds', async () => {
    const saved: string[] = []
    const account = fakeAccount(async () => {
      saved.push('called')
    })
    const result = await completeQrLogin(deps({ account }), {
      cookie: 'xyz',
      persist: true,
    })
    expect(result.persisted).toBe(true)
    expect(saved).toHaveLength(1)
  })

  it('does not persist when persist=false', async () => {
    let called = false
    const account = fakeAccount(async () => {
      called = true
    })
    const result = await completeQrLogin(deps({ account }), {
      cookie: 'xyz',
      persist: false,
    })
    expect(result.persisted).toBe(false)
    expect(called).toBe(false)
  })

  it('returns persisted=false (not throw) when saveCookie fails', async () => {
    const account = fakeAccount(async () => {
      throw new Error('disk full')
    })
    const warns: string[] = []
    const result = await completeQrLogin(deps({ account, log: { warn: (m) => warns.push(m) } }), {
      cookie: 'xyz',
      persist: true,
    })
    expect(result.ok).toBe(true)
    expect(result.persisted).toBe(false)
    expect(warns.some((w) => w.includes('saveCookie failed'))).toBe(true)
  })

  it('snapshot fetch failure does not break login (fire-and-forget)', async () => {
    const ncm = fakeNcm({
      fetchUserSnapshot: vi.fn(async () => {
        throw new Error('NCM down')
      }),
    })
    const result = await completeQrLogin(deps({ ncm }), {
      cookie: 'xyz',
      persist: false,
    })
    expect(result.ok).toBe(true)
    // 不等 fire-and-forget settle, 主流程已返回
  })
})
