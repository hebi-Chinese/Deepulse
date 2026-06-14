import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: 'Deepulse',
  description: '个人 AI 电台',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="minimal" data-mode="dark">
      <body>{children}</body>
    </html>
  )
}
