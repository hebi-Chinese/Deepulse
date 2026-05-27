'use client'

// WeatherSwitcher · 右上角浮岛,五个天气切换 + 当前小时显示
// v1 手动切; M5 接真实天气 API 时,这个 UI 变成只读 indicator

import { WEATHER_LABEL, WEATHERS, type Weather } from './types'

type Props = {
  readonly weather: Weather
  readonly onChange: (next: Weather) => void
}

export function WeatherSwitcher({ weather, onChange }: Props) {
  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 bg-white/8 backdrop-blur-xl border border-white/12 shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
      {WEATHERS.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => {
            onChange(w)
          }}
          className={`text-xs px-2.5 py-1 rounded-full transition-all ${
            w === weather
              ? 'bg-white/20 text-white shadow-inner'
              : 'text-white/55 hover:text-white/85 hover:bg-white/8'
          }`}
          aria-pressed={w === weather}
        >
          {WEATHER_LABEL[w]}
        </button>
      ))}
    </div>
  )
}
