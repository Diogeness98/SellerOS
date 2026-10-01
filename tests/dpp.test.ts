import { describe, expect, it } from 'vitest'
import { createSession, createSessionToken } from '../shared/auth'
import { containsSensitiveValue, initiativeDeadline } from '../worker/dpp'
import { handleRequest } from '../worker/api'
import type { D1Database, D1Result, D1Statement, Env } from '../worker/types'

class Statement implements D1Statement {
  constructor(private readonly db: DppDb, private readonly query: string, private readonly values: unknown[] = []) {}
  bind(...values: unknown[]): D1Statement { return new Statement(this.db, this.query, values) }
  async first<T>(): Promise<T | null> {
    if (this.query.includes('FROM platform_admins')) return this.db.admins.has(String(this.values[0])) ? { user_id: this.values[0] } as T : null
    if (this.query.includes("DPP_GMVE_TARGET_USD")) return { value: '2500000' } as T
    if (this.query.includes('connected_sellers')) return { connected_sellers: 0, active_sellers: 0, healthy_sellers: 0, disconnected_sellers: 0 } as T
    return null
  }
  async all<T>(): Promise<D1Result<T>> { return { results: [] as T[], success: true } }
  async run(): Promise<D1Result> { return { results: [], success: true, meta: { changes: 1 } } }
}
class DppDb implements D1Database {
  admins = new Set<string>()
  prepare(query: string): D1Statement { return new Statement(this, query) }
}
const secret = 'test-session-secret-with-at-least-32-chars'
async function requestAs(userId: string, db: DppDb, path = '/api/admin/dpp/readiness') {
  const token = await createSessionToken(createSession(userId, 'workspace-a', 'OWNER'), secret)
  const env: Env = { DB: db, SESSION_SECRET: secret, MERCADOLIVRE_CLIENT_ID: 'configured', MERCADOLIVRE_REDIRECT_URI: 'https://selleros.example/callback' }
  return handleRequest(new Request(`https://selleros.example${path}`, { headers: { cookie: `selleros_session=${token}` } }), env)
}

describe('DPP certification readiness', () => {
  it('denies unauthenticated users and workspace owners without global administration', async () => {
    const db = new DppDb()
    const env: Env = { DB: db, SESSION_SECRET: secret }
    expect((await handleRequest(new Request('https://selleros.example/api/admin/dpp/readiness'), env)).status).toBe(401)
    expect((await requestAs('workspace-owner', db)).status).toBe(403)
  })

  it('allows an explicitly allow-listed platform administrator and keeps the output safe', async () => {
    const db = new DppDb(); db.admins.add('platform-admin')
    const readiness = await requestAs('platform-admin', db)
    expect(readiness.status).toBe(200)
    const exportResponse = await requestAs('platform-admin', db, '/api/admin/dpp/export')
    expect(exportResponse.status).toBe(200)
    const serialized = JSON.stringify(await exportResponse.json())
    for (const prohibited of ['access_token', 'refresh_token', 'client_secret', 'password_hash', 'session_secret']) expect(serialized).not.toContain(prohibited)
  })

  it('marks sensitive evidence inputs and evaluates initiative deadlines deterministically', () => {
    expect(containsSensitiveValue('access_token must not be stored')).toBe(true)
    expect(containsSensitiveValue('tests/mercadolivre.test.ts')).toBe(false)
    expect(initiativeDeadline(null)).toBeNull()
    expect(initiativeDeadline(new Date(Date.now() - 86_400_000).toISOString())).toBe('VENCIDO')
    expect(initiativeDeadline(new Date(Date.now() + 2 * 86_400_000).toISOString())).toBe('ATENCAO')
  })
})
