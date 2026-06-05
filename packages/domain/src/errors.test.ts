import { describe, expect, it } from 'vitest'

import { DomainError, ExternalServiceError, NotFoundError, ValidationError } from './errors.js'

describe('domain errors', () => {
  it('DomainError is an Error subclass', () => {
    const e = new DomainError('boom')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(DomainError)
    expect(e.name).toBe('DomainError')
    expect(e.message).toBe('boom')
  })

  it('NotFoundError formats resource + id in message', () => {
    const e = new NotFoundError('Song', 'abc-123')
    expect(e).toBeInstanceOf(DomainError)
    expect(e.name).toBe('NotFoundError')
    expect(e.message).toBe('Song not found: abc-123')
  })

  it('ValidationError carries the raw message', () => {
    const e = new ValidationError('field xyz is missing')
    expect(e).toBeInstanceOf(DomainError)
    expect(e.name).toBe('ValidationError')
    expect(e.message).toBe('field xyz is missing')
  })

  it('ExternalServiceError prefixes message with service tag', () => {
    const e = new ExternalServiceError('NCM', 'request failed', 500)
    expect(e).toBeInstanceOf(DomainError)
    expect(e.name).toBe('ExternalServiceError')
    expect(e.message).toBe('[NCM] request failed')
    expect(e.statusCode).toBe(500)
  })

  it('ExternalServiceError preserves cause chain', () => {
    const root = new TypeError('json parse failed')
    const e = new ExternalServiceError('brain', 'wrap', undefined, { cause: root })
    expect(e.cause).toBe(root)
  })

  it('all error classes are catchable as DomainError', () => {
    const errors: Error[] = [
      new NotFoundError('X', '1'),
      new ValidationError('bad'),
      new ExternalServiceError('Y', 'err'),
    ]
    for (const e of errors) {
      expect(e).toBeInstanceOf(DomainError)
    }
  })
})
