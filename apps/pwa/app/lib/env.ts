// 前端 env 集中校验 · 与后端 @deepulse/shared/config 同样的设计原则
// Next.js 公开 env 必须 NEXT_PUBLIC_ 前缀,build 时内联,所以这里只能直接读 process.env
// 但读完一次后,业务代码只能从这里 import,不准散落 process.env

import { z } from 'zod'

const envSchema = z.object({
  serverUrl: z.string().url(),
})

// build 时内联: process.env 必须用字符串字面量 key,不能动态拼
const RAW = {
  serverUrl: process.env['NEXT_PUBLIC_SERVER_URL'] ?? 'http://127.0.0.1:8787',
} as const

export const env = envSchema.parse(RAW)
