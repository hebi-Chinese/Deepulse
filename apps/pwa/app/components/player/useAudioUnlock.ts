'use client'

// useAudioUnlock · 首次用户事件触发时,在 gesture 同步链路里 resume 共享 AudioContext
// 原因: useAudioAnalyser 复用同一个 ctx,ctx 必须 running 才能让 audio 通过它出声
// (否则即使 audio.paused=false,声音也被 suspended ctx 吞掉)
//
// 不再 prime audio 元素 src: 之前用 silent wav 调 play()+pause() 想给元素一个 "已激活"
// 标记,但 audio 元素本身不需要单独激活 (Chrome 看 document.userActivation),
// 反而引入 race condition — silent 的 pause 异步 resolve 时可能把真歌也 pause 掉。

import { useEffect } from 'react'

import { getSharedAudioCtx, unlockSharedAudioCtx } from './sharedAudioCtx'

export function useAudioUnlock(_audioRef: React.RefObject<HTMLAudioElement | null>): void {
  useEffect(() => {
    let unlocked = false

    const unlock = (): void => {
      if (unlocked) return
      unlocked = true
      void unlockSharedAudioCtx().then((ok) => {
        if (!ok) return
        const ctx = getSharedAudioCtx()
        if (ctx === null) return
        try {
          // 播一个 0-length buffer,触发 Chrome 把页面标记为已激活
          const bufferSource = ctx.createBufferSource()
          bufferSource.buffer = ctx.createBuffer(1, 1, 22050)
          bufferSource.connect(ctx.destination)
          bufferSource.start(0)
        } catch {
          // 不阻塞
        }
      })
    }

    window.addEventListener('pointerdown', unlock, { passive: true })
    window.addEventListener('keydown', unlock, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])
}
