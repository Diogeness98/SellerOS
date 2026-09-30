import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSession, createSessionToken } from '../shared/auth'
import { createCodeChallenge } from '../shared/oauth'
import { handleRequest } from '../worker/api'
import type { D1Database, D1Result, D1Statement, Env } from '../worker/types'

type Attempt = { state: string; user_id: string; workspace_id: string; code_verifier: string; expires_at: string; consumed_at: string | null }
type Integration = { id: string; workspace_id: string; channel: string; status: string; external_account_id: string | null; access_token_encrypted: string | null; refresh_token_encrypted: string | null; token_expires_at: string | null; last_sync_at: string | null }

class FakeStatement implements D1Statement {
  constructor(private readonly db: FakeDb, private readonly query: string, private readonly values: unknown[] = []) {}
  bind(...values: unknown[]): D1Statement { return new FakeStatement(this.db, this.query, values) }
  async first<T>(): Promise<T | null> { return this.db.first<T>(this.query, this.values) }
  async all<T>(): Promise<D1Result<T>> { return { results: [] as T[], success: true } }
  async run(): Promise<D1Result> { return this.db.run(this.query, this.values) }
}

class FakeDb implements D1Database {
  attempts: Attempt[] = []
  integrations: Integration[] = []
  auditCount = 0
  prepare(query: string): D1Statement { return new FakeStatement(this, query) }
  async first<T>(query: string, values: unknown[]): Promise<T | null> {
    if (query.includes('FROM oauth_attempts')) return (this.attempts.find((attempt) => attempt.state === values[0]) as T | undefined) ?? null
    if (query.includes('FROM integrations')) return (this.integrations.find((integration) => integration.workspace_id === values[0] && integration.channel === 'MERCADOLIVRE') as T | undefined) ?? null
    return null
  }
  async run(query: string, values: unknown[]): Promise<D1Result> {
    if (query.startsWith('INSERT INTO oauth_attempts')) {
      this.attempts.push({ state: String(values[0]), user_id: String(values[1]), workspace_id: String(values[2]), code_verifier: String(values[3]), expires_at: String(values[4]), consumed_at: null })
      return { results: [], success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('UPDATE oauth_attempts')) {
      const attempt = this.attempts.find((candidate) => candidate.state === values[1] && !candidate.consumed_at && candidate.expires_at > String(values[2]))
      if (!attempt) return { results: [], success: true, meta: { changes: 0 } }
      attempt.consumed_at = String(values[0])
      return { results: [], success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('INSERT INTO integrations')) {
      const existing = this.integrations.find((integration) => integration.workspace_id === values[1] && integration.channel === 'MERCADOLIVRE')
      const next: Integration = { id: String(values[0]), workspace_id: String(values[1]), channel: 'MERCADOLIVRE', status: 'CONNECTED', external_account_id: String(values[2]), access_token_encrypted: String(values[3]), refresh_token_encrypted: String(values[4]), token_expires_at: String(values[5]), last_sync_at: null }
      if (existing) Object.assign(existing, next, { id: existing.id })
      else this.integrations.push(next)
      return { results: [], success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('UPDATE integrations')) {
      const integration = this.integrations.find((candidate) => candidate.workspace_id === values[0] && candidate.channel === 'MERCADOLIVRE')
      if (integration) Object.assign(integration, { status: 'DISCONNECTED', access_token_encrypted: null, refresh_token_encrypted: null, token_expires_at: null })
      return { results: [], success: true, meta: { changes: integration ? 1 : 0 } }
    }
    if (query.startsWith('INSERT INTO audit_logs')) this.auditCount += 1
    return { results: [], success: true, meta: { changes: 1 } }
  }
}

const secret = 'test-session-secret-with-at-least-32-chars'
const tokenKey = 'test-token-encryption-key-with-at-least-32-chars'

function makeEnv(db = new FakeDb()): Env & { DB: FakeDb } {
  return { DB: db, SESSION_SECRET: secret, MERCADOLIVRE_CLIENT_ID: 'client-id', MERCADOLIVRE_CLIENT_SECRET: 'client-secret', MERCADOLIVRE_REDIRECT_URI: 'https://selleros.xxxdiogenes.workers.dev/api/integrations/mercadolivre/callback', TOKEN_ENCRYPTION_KEY: tokenKey }
}

async function cookieFor(workspaceId = 'workspace-a', userId = 'user-1') {
  return `selleros_session=${await createSessionToken(createSession(userId, workspaceId, 'OWNER'), secret)}`
}

describe('Mercado Livre OAuth preparation', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects connect without a session', async () => {
    const response = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/connect'), makeEnv())
    expect(response.status).toBe(403)
  })

  it('rejects integration status without a session', async () => {
    const response = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/status'), makeEnv())
    expect(response.status).toBe(403)
  })

  it('generates a valid PKCE S256 challenge', async () => {
    expect(await createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('creates a state-bound connect redirect', async () => {
    const db = new FakeDb()
    const response = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/connect', { headers: { cookie: await cookieFor() } }), makeEnv(db))
    expect(response.status).toBe(302)
    const location = response.headers.get('location')!
    expect(new URL(location).hostname).toBe('auth.mercadolivre.com.br')
    expect(new URL(location).searchParams.get('code_challenge_method')).toBe('S256')
    expect(db.attempts).toHaveLength(1)
  })

  it('rejects an invalid state', async () => {
    const response = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/callback?state=unknown&code=code', { headers: { cookie: await cookieFor() } }), makeEnv())
    expect(response.status).toBe(400)
  })

  it('rejects an expired state', async () => {
    const db = new FakeDb()
    db.attempts.push({ state: 'expired', user_id: 'user-1', workspace_id: 'workspace-a', code_verifier: 'verifier', expires_at: '2020-01-01T00:00:00.000Z', consumed_at: null })
    const response = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/callback?state=expired&code=code', { headers: { cookie: await cookieFor() } }), makeEnv(db))
    expect(response.status).toBe(400)
  })

  it('rejects a reused state', async () => {
    const db = new FakeDb()
    db.attempts.push({ state: 'used', user_id: 'user-1', workspace_id: 'workspace-a', code_verifier: 'verifier', expires_at: '2999-01-01T00:00:00.000Z', consumed_at: '2026-01-01T00:00:00.000Z' })
    const response = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/callback?state=used&code=code', { headers: { cookie: await cookieFor() } }), makeEnv(db))
    expect(response.status).toBe(400)
  })

  it('rejects a callback without a code', async () => {
    const response = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/callback?state=state', { headers: { cookie: await cookieFor() } }), makeEnv())
    expect(response.status).toBe(400)
  })

  it('rejects a callback from a different workspace', async () => {
    const db = new FakeDb()
    db.attempts.push({ state: 'state', user_id: 'user-1', workspace_id: 'workspace-b', code_verifier: 'verifier', expires_at: '2999-01-01T00:00:00.000Z', consumed_at: null })
    const response = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/callback?state=state&code=code', { headers: { cookie: await cookieFor('workspace-a') } }), makeEnv(db))
    expect(response.status).toBe(400)
  })

  it('stores tokens encrypted and never returns them', async () => {
    const db = new FakeDb()
    db.attempts.push({ state: 'state', user_id: 'user-1', workspace_id: 'workspace-a', code_verifier: 'verifier', expires_at: '2999-01-01T00:00:00.000Z', consumed_at: null })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 21600, scope: 'offline_access read' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 123456789 }), { status: 200 })))
    const response = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/callback?state=state&code=code', { headers: { cookie: await cookieFor() } }), makeEnv(db))
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).not.toContain('access-token')
    expect(db.integrations[0].access_token_encrypted).toMatch(/^v1\./)
    expect(db.integrations[0].access_token_encrypted).not.toContain('access-token')
    expect(db.integrations[0].refresh_token_encrypted).not.toContain('refresh-token')
  })

  it('does not create duplicate integrations', async () => {
    const db = new FakeDb()
    const env = makeEnv(db)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 21600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token-2', refresh_token: 'refresh-token-2', expires_in: 21600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 200 })))
    for (const state of ['one', 'two']) {
      db.attempts.push({ state, user_id: 'user-1', workspace_id: 'workspace-a', code_verifier: 'verifier', expires_at: '2999-01-01T00:00:00.000Z', consumed_at: null })
      await handleRequest(new Request(`https://selleros.xxx/api/integrations/mercadolivre/callback?state=${state}&code=code`, { headers: { cookie: await cookieFor() } }), env)
    }
    expect(db.integrations).toHaveLength(1)
  })

  it('scopes status and disconnect to the current workspace', async () => {
    const db = new FakeDb()
    db.integrations.push({ id: 'integration', workspace_id: 'workspace-a', channel: 'MERCADOLIVRE', status: 'CONNECTED', external_account_id: '123', access_token_encrypted: 'v1.x.y', refresh_token_encrypted: 'v1.x.z', token_expires_at: '2999-01-01T00:00:00.000Z', last_sync_at: null })
    const env = makeEnv(db)
    const status = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/status', { headers: { cookie: await cookieFor('workspace-b') } }), env)
    expect(await status.json()).toMatchObject({ connected: false, externalAccountId: null })
    const disconnect = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/disconnect', { method: 'POST', headers: { cookie: await cookieFor('workspace-b') } }), env)
    expect(disconnect.status).toBe(200)
    expect(db.integrations[0].status).toBe('CONNECTED')
  })
})
