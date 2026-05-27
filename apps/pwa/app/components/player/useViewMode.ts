// useViewMode · Browse | Listen 二态状态机
// Browse: 默认, 搜索+队列+推荐
// Listen: 模态全屏, 关窗沉浸, 只剩唱片/歌词/viz/DJ
// 切换路径: playSong → Listen; Esc/⊘ → Browse
// 暂停 ≠ 退出 Listen (用户去倒水场景)

import { useCallback, useEffect, useState } from 'react'

export type ViewMode = 'browse' | 'listen'

export type ViewModeHook = {
  readonly mode: ViewMode
  readonly enterListen: () => void
  readonly exitListen: () => void
}

export function useViewMode(): ViewModeHook {
  const [mode, setMode] = useState<ViewMode>('browse')

  const enterListen = useCallback(() => {
    setMode('listen')
  }, [])
  const exitListen = useCallback(() => {
    setMode('browse')
  }, [])

  // Esc 退出 Listen
  useEffect(() => {
    if (mode !== 'listen') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') exitListen()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [mode, exitListen])

  return { mode, enterListen, exitListen }
}
