import { describe, expect, it } from 'vitest'
import { canManageWorkspace, canOperateWorkspace } from '../shared/auth'
import { isAllowedMutationOrigin } from '../worker/api'
import { handleRequest } from '../worker/api'
import { takeRateLimit } from '../worker/rate-limit'
import { createSession, createSessionToken } from '../shared/auth'
import type { D1Database, D1Result, D1Statement, Env } from '../worker/types'

class Statement implements D1Statement {
  constructor(private readonly db: RateDb, private readonly values: unknown[] = []) {}
  bind(...values: unknown[]): D1Statement { return new Statement(this.db, values) }
  async first<T>(): Promise<T | null> { return this.db.take<T>(this.values) }
  async all<T>(): Promise<D1Result<T>> { return { results: [], success: true } }
  async run(): Promise<D1Result> { return { results: [], success: true } }
}
class RateDb implements D1Database {
  buckets = new Map<string, { started: string; count: number }>()
  prepare(): D1Statement { return new Statement(this) }
  async take<T>(values: unknown[]): Promise<T> {
    const [key, current, _expires, resetBefore] = values as string[]; const existing = this.buckets.get(key)
    const reset = !existing || existing.started <= resetBefore
    const next = { started: reset ? current : existing.started, count: reset ? 1 : existing.count + 1 }
    this.buckets.set(key, next); return { request_count: next.count } as T
  }
}

class NoopStatement implements D1Statement {
  bind(): D1Statement { return this }
  async first<T>(): Promise<T | null> { return null }
  async all<T>(): Promise<D1Result<T>> { return { results: [], success: true } }
  async run(): Promise<D1Result> { return { results: [], success: true, meta: { changes: 1 } } }
}
class NoopDb implements D1Database { prepare(): D1Statement { return new NoopStatement() } }
const apiSecret = 'test-session-secret-with-at-least-32-chars'
async function requestAs(role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER', path: string) {
  const token = await createSessionToken(createSession('user-a', 'workspace-a', role), apiSecret)
  const env: Env = { DB: new NoopDb(), SESSION_SECRET: apiSecret, OPENAI_API_KEY: 'test', OPENAI_MODEL: 'gpt-5.6-luna' }
  return handleRequest(new Request(`https://selleros.example${path}`, { method: 'POST', headers: { cookie: `selleros_session=${token}` } }), env)
}

describe('final security controls', () => {
  it('grants operational actions only to operational roles and management only to OWNER or ADMIN', () => {
    expect(canOperateWorkspace('OWNER')).toBe(true); expect(canOperateWorkspace('ADMIN')).toBe(true); expect(canOperateWorkspace('MANAGER')).toBe(true); expect(canOperateWorkspace('OPERATOR')).toBe(true); expect(canOperateWorkspace('VIEWER')).toBe(false)
    expect(canManageWorkspace('OWNER')).toBe(true); expect(canManageWorkspace('ADMIN')).toBe(true); expect(canManageWorkspace('OPERATOR')).toBe(false); expect(canManageWorkspace('VIEWER')).toBe(false)
  })

  it('rejects cross-origin mutable requests', () => {
    const url = new URL('https://selleros.example/api/auth/login')
    expect(isAllowedMutationOrigin(new Request(url, { method: 'POST', headers: { origin: 'https://attacker.example' } }), url)).toBe(false)
    expect(isAllowedMutationOrigin(new Request(url, { method: 'POST', headers: { origin: url.origin } }), url)).toBe(true)
  })

  it('uses a persistent HMAC bucket and returns RATE_LIMITED eligibility after the limit', async () => {
    const db = new RateDb(); const now = new Date('2026-10-01T12:00:00.000Z')
    await expect(takeRateLimit(db, 'login', '203.0.113.1', 'test-session-secret-with-at-least-32-chars', 2, 60_000, now)).resolves.toBe(true)
    await expect(takeRateLimit(db, 'login', '203.0.113.1', 'test-session-secret-with-at-least-32-chars', 2, 60_000, now)).resolves.toBe(true)
    await expect(takeRateLimit(db, 'login', '203.0.113.1', 'test-session-secret-with-at-least-32-chars', 2, 60_000, now)).resolves.toBe(false)
    expect([...db.buckets.keys()][0]).not.toContain('203.0.113.1')
  })

  it('enforces final RBAC on management and operational routes', async () => {
    await expect(requestAs('VIEWER', '/api/integrations/mercadolivre/disconnect')).resolves.toMatchObject({ status: 403 })
    await expect(requestAs('VIEWER', '/api/returnshield/cases/claim-1/evidence/sync')).resolves.toMatchObject({ status: 403 })
    await expect(requestAs('VIEWER', '/api/returnshield/cases/claim-1/defense-analysis')).resolves.toMatchObject({ status: 403 })
    await expect(requestAs('OPERATOR', '/api/integrations/mercadolivre/disconnect')).resolves.toMatchObject({ status: 403 })
    await expect(requestAs('OPERATOR', '/api/returnshield/cases/claim-1/evidence/sync')).resolves.toMatchObject({ status: 404 })
    await expect(requestAs('OPERATOR', '/api/returnshield/cases/claim-1/defense-analysis')).resolves.toMatchObject({ status: 404 })
    await expect(requestAs('OWNER', '/api/integrations/mercadolivre/disconnect')).resolves.toMatchObject({ status: 200 })
  })
})
