import { describe, expect, it } from 'vitest'
import { createSession, createSessionToken } from '../shared/auth'
import { handleRequest } from '../worker/api'
import type { D1Database, D1Result, D1Statement, Env } from '../worker/types'

type User = { id: string; email: string }

class FakeStatement implements D1Statement {
  constructor(private readonly db: FakeDb, private readonly query: string, private readonly values: unknown[] = []) {}
  bind(...values: unknown[]): D1Statement { return new FakeStatement(this.db, this.query, values) }
  async first<T>(): Promise<T | null> { return this.db.first<T>(this.query, this.values) }
  async all<T>(): Promise<D1Result<T>> { return { results: [] as T[], success: true } }
  async run(): Promise<D1Result> { return { results: [], success: true } }
}

class FakeDb implements D1Database {
  users: User[] = [{ id: 'user-1', email: 'owner@example.com' }]
  prepare(query: string): D1Statement { return new FakeStatement(this, query) }
  async first<T>(query: string, values: unknown[]): Promise<T | null> {
    if (query.includes('SELECT id, email FROM users')) return (this.users.find((user) => user.id === values[0]) as T | undefined) ?? null
    return null
  }
}

const secret = 'test-session-secret-with-at-least-32-chars'

function makeEnv(): Env { return { DB: new FakeDb(), SESSION_SECRET: secret } }

async function sessionCookie() {
  const token = await createSessionToken(createSession('user-1', 'workspace-a', 'OWNER'), secret)
  return `selleros_session=${token}`
}

describe('session endpoints', () => {
  it('returns authenticated false without a session cookie', async () => {
    const response = await handleRequest(new Request('https://selleros.xxx/api/auth/session'), makeEnv())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ authenticated: false })
  })

  it('returns only safe data for a valid signed session', async () => {
    const response = await handleRequest(new Request('https://selleros.xxx/api/auth/session', { headers: { cookie: await sessionCookie() } }), makeEnv())
    const body = await response.json() as Record<string, unknown>
    expect(body).toEqual({ authenticated: true, user: { id: 'user-1', email: 'owner@example.com' }, workspaceId: 'workspace-a' })
    expect(JSON.stringify(body)).not.toContain('selleros_session')
    expect(JSON.stringify(body)).not.toContain('OWNER')
  })

  it('expires the session cookie on logout', async () => {
    const response = await handleRequest(new Request('https://selleros.xxx/api/auth/logout', { method: 'POST' }), makeEnv())
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('selleros_session=; Max-Age=0')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Lax; Path=/')
    expect(await response.json()).toEqual({ loggedOut: true })
  })
})
