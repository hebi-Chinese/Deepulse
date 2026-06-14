// 把 BrainMessage[] 拆成 systemPrompt + userPrompt
// claude CLI 接收 --system-prompt 和单个 prompt 参数,所以把 system 块聚合、其余拼对话

import type { BrainMessage } from '@deepulse/application'

export type SplitPrompt = {
  readonly systemPrompt: string | undefined
  readonly userPrompt: string
}

export function splitMessages(messages: readonly BrainMessage[]): SplitPrompt {
  const systemParts: string[] = []
  const turnParts: string[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content)
      continue
    }
    const tag = msg.role === 'user' ? 'User' : 'Assistant'
    turnParts.push(`${tag}: ${msg.content}`)
  }

  const systemPrompt = systemParts.length > 0 ? systemParts.join('\n\n') : undefined
  const userPrompt = turnParts.length > 0 ? turnParts.join('\n\n') : ''

  return { systemPrompt, userPrompt }
}
