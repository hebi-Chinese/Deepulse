// Atmosphere 共享类型 + 引擎契约
// 新增天气 = 实现 AtmosphereEngine + 注册到 manager,不动主组件

export const WEATHERS = ['clear', 'rain', 'snow', 'fog'] as const
export type Weather = (typeof WEATHERS)[number]

export const WEATHER_LABEL: Record<Weather, string> = {
  clear: '晴',
  rain: '雨',
  snow: '雪',
  fog: '雾',
}

export type Viewport = {
  readonly width: number
  readonly height: number
  readonly dpr: number
}

// 鼠标位置 + 是否在窗口内 (用于视差风向)
export type Pointer = {
  readonly x: number
  readonly y: number
  readonly inside: boolean
}

// 用户点击产生的涟漪事件
export type RippleSpawn = {
  readonly x: number
  readonly y: number
  readonly atMs: number
}

// 引擎对外契约:任何 weather 都实现这套
// init: viewport 首次拿到时调一次,准备粒子池
// resize: viewport 变化重铺
// step: 每帧推进物理,dtMs 是上帧到本帧间隔
// draw: 绘制当前帧到 ctx
// dispose: 清理 (虽然纯 JS 对象无需,但留口子)
export type AtmosphereEngine = {
  readonly init: (viewport: Viewport) => void
  readonly resize: (viewport: Viewport) => void
  readonly step: (dtMs: number, pointer: Pointer, ripples: readonly RippleSpawn[]) => void
  readonly draw: (ctx: CanvasRenderingContext2D, viewport: Viewport) => void
  readonly dispose: () => void
}
