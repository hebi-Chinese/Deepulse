// 领域错误类层级 — 错误信息必须包含: 操作 + 失败原因 + 相关 ID/上下文
// 所有自定义错误继承 DomainError，便于 instanceof 收窄
// 这里属于 domain (最内层, 零外部依赖) — 跨包通用错误概念归属业务模型, 不是传输/transport 关注点

export class DomainError extends Error {
  override readonly name: string = 'DomainError'
}

export class NotFoundError extends DomainError {
  override readonly name = 'NotFoundError'

  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`)
  }
}

export class ValidationError extends DomainError {
  override readonly name = 'ValidationError'
}

export class ExternalServiceError extends DomainError {
  override readonly name = 'ExternalServiceError'

  constructor(
    service: string,
    message: string,
    public readonly statusCode?: number,
    options?: ErrorOptions,
  ) {
    super(`[${service}] ${message}`, options)
  }
}
