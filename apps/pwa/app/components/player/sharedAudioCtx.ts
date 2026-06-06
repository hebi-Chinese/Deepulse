// sharedAudioCtx · 全局唯一 AudioContext + 音乐 ducking
//
// 为什么必须共享:
//   useAudioAnalyser 会调 createMediaElementSource(audio),这一步会**永久**把 audio 的
//   输出路由到这个 AudioContext 的 graph。如果 ctx 是 suspended,audio 就**没声音**
//   (尽管 audio.paused=false)。
//
//   ctx.resume() 必须在用户 gesture 里调,否则 Chrome 拒绝。如果 unlock 用一个 ctx、
//   analyser 用另一个 ctx,那 analyser 的 ctx 永远没机会被 resume → audio 永远静音。
//
//   所以: 同一个 ctx,unlock 时 resume,analyser 复用。
//
// 为什么有 musicGain (ducking):
//   真实电台 DJ 说话时音乐自动压低 (~25%), 说完慢慢升回. 这就是 ducking.
//   音乐流过 musicGain → destination, DJ 说话时把 musicGain 滑到 DUCK_LEVEL,
//   说完滑回 1.0. DJ TTS 不走 Web Audio (浏览器默认), 不受 musicGain 影响.
//   主人定: 视觉 (analyser) 不跟 DJ 跳, 所以 analyser 接 source 旁路, 不进 destination.

let shared: AudioContext | null = null
let resumed = false
let musicGainNode: GainNode | null = null

// duck 到 25% — 不至于完全听不到 (DJ 配乐的氛围还在), 又能让 DJ 词清晰
const DUCK_LEVEL = 0.25
// 300ms 缓动 — 真电台经验值, 太快有明显跳变, 太慢 DJ 第一字会被音乐盖
const RAMP_SEC = 0.3

export function getSharedAudioCtx(): AudioContext | null {
  if (shared !== null) return shared
  if (typeof window === 'undefined') return null
  try {
    shared = new AudioContext()
  } catch {
    return null
  }
  return shared
}

// 在 user gesture 内调一次,负责 resume + 标记
export async function unlockSharedAudioCtx(): Promise<boolean> {
  const ctx = getSharedAudioCtx()
  if (ctx === null) return false
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      return false
    }
  }
  resumed = ctx.state === 'running'
  return resumed
}

export function isSharedAudioCtxRunning(): boolean {
  return resumed && shared !== null && shared.state === 'running'
}

// 音乐流的 GainNode — useAudioAnalyser 接 source 时拉这个
// lazy 创建: 没音乐时 null, duck/restore 都成 no-op
export function getMusicGainNode(): GainNode | null {
  const ctx = getSharedAudioCtx()
  if (ctx === null) return null
  if (musicGainNode === null) {
    musicGainNode = ctx.createGain()
    musicGainNode.gain.value = 1.0
    musicGainNode.connect(ctx.destination)
  }
  return musicGainNode
}

export function duckMusic(): void {
  rampMusicGainTo(DUCK_LEVEL)
}

export function restoreMusic(): void {
  rampMusicGainTo(1.0)
}

function rampMusicGainTo(target: number): void {
  const node = musicGainNode
  const ctx = shared
  // 音乐还没接 (DJ 先说话) → 没东西可 duck, no-op
  if (node === null || ctx === null) return
  const t = ctx.currentTime
  // cancelScheduled 防之前的 ramp 没跑完叠加; setValueAtTime 锚住"现在的值"
  // 不锚就 cancel 后从 ramp 起点接, 视觉/听觉会跳
  node.gain.cancelScheduledValues(t)
  node.gain.setValueAtTime(node.gain.value, t)
  node.gain.linearRampToValueAtTime(target, t + RAMP_SEC)
}
