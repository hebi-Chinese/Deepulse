// callNcm · 统一封装 "调 NCM 库 → 校验 envelope → 校验 body shape" 三步
// 业务方法不再写 `as RespType`,也不重复 assertOk(200) 逻辑

import { ExternalServiceError } from '@claudio/domain'
import { z } from 'zod'

const envelopeSchema = z.object({
  status: z.number(),
  body: z.unknown(),
})

export async function callNcm<T>(
  fn: () => Promise<unknown>,
  bodySchema: z.ZodSchema<T>,
  op: string,
): Promise<T> {
  let raw: unknown
  try {
    raw = await fn()
  } catch (err) {
    throw new ExternalServiceError('NCM', `${op}: network/lib error`, undefined, { cause: err })
  }

  const env = envelopeSchema.safeParse(raw)
  if (!env.success) {
    throw new ExternalServiceError('NCM', `${op}: envelope shape invalid: ${env.error.message}`)
  }
  if (env.data.status !== 200) {
    throw new ExternalServiceError(
      'NCM',
      `${op} failed: status=${String(env.data.status)}`,
      env.data.status,
    )
  }

  const body = bodySchema.safeParse(env.data.body)
  if (!body.success) {
    throw new ExternalServiceError('NCM', `${op}: body shape invalid: ${body.error.message}`)
  }
  return body.data
}
