import { describe, expect, it } from 'vitest'
import { verifyPassword } from '../shared/auth'
import { handleRequest } from '../worker/api'
import type { D1Database, D1Result, D1Statement, Env } from '../worker/types'

type User = { id: string; email: string; password_hash: string }
type Workspace = { id: string; name: string }
type Membership = { workspace_id: string; user_id: string; role: string }
type Audit = { id: string; workspace_id: string; actor_id: string; action: string }

class FakeStatement implements D1Statement {
  constructor(
    private readonly db: FakeDb,
    readonly query: string,
    readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1Statement { return new FakeStatement(this.db, this.query, values) }
  async first<T>(): Promise<T | null> { return this.db.first<T>(this.query) }
  async all<T>(): Promise<D1Result<T>> { return { results: [] as T[], success: true } }
  async run(): Promise<D1Result> { return { results: [], success: true, meta: { changes: 0 } } }
}

class FakeDb implements D1Database {
  users: User[] = []
  workspaces: Workspace[] = []
  memberships: Membership[] = []
  audits: Audit[] = []

  prepare(query: string): D1Statement { return new FakeStatement(this, query) }

  async first<T>(query: string): Promise<T | null> {
    if (!query.includes('EXISTS(SELECT 1 FROM users')) return null
    return {
      has_user: this.users.length > 0 ? 1 : 0,
      has_owner: this.memberships.some((membership) => membership.role === 'OWNER') ? 1 : 0,
    } as T
  }

  async batch(statements: D1Statement[]): Promise<D1Result[]> {
    const snapshot = {
      users: [...this.users],
      workspaces: [...this.workspaces],
      memberships: [...this.memberships],
      audits: [...this.audits],
    }

    try {
      const results: D1Result[] = []
      for (const rawStatement of statements) {
        const statement = rawStatement as FakeStatement
        let changes = 1
        if (statement.query.includes('INSERT INTO users')) {
          if (this.users.length || this.memberships.some((membership) => membership.role === 'OWNER')) {
            changes = 0
          } else {
            this.users.push({ id: String(statement.values[0]), email: String(statement.values[1]), password_hash: String(statement.values[2]) })
          }
        } else if (statement.query.startsWith('INSERT INTO workspaces')) {
          this.workspaces.push({ id: String(statement.values[0]), name: String(statement.values[1]) })
        } else if (statement.query.startsWith('INSERT INTO workspace_members')) {
          if (!this.users.some((user) => user.id === statement.values[1])) throw new Error('foreign key constraint')
          this.memberships.push({ workspace_id: String(statement.values[0]), user_id: String(statement.values[1]), role: 'OWNER' })
        } else if (statement.query.startsWith('INSERT INTO audit_logs')) {
          this.audits.push({ id: String(statement.values[0]), workspace_id: String(statement.values[1]), actor_id: String(statement.values[2]), action: 'OWNER_BOOTSTRAPPED' })
        }
        results.push({ results: [], success: true, meta: { changes } })
      }
      return results
    } catch (cause) {
      this.users = snapshot.users
      this.workspaces = snapshot.workspaces
      this.memberships = snapshot.memberships
      this.audits = snapshot.audits
      throw cause
    }
  }
}

const bootstrapSecret = 'owner-bootstrap-secret-with-more-than-forty-eight-characters-123456'
const password = 'Strong!Bootstrap9'
const payload = { email: 'owner@example.com', password, workspaceName: 'SellerOS' }

function makeEnv(db = new FakeDb()): Env & { DB: FakeDb } {
  return {
    DB: db,
    SESSION_SECRET: 'test-session-secret-with-at-least-32-characters',
    OWNER_BOOTSTRAP_SECRET: bootstrapSecret,
  }
}

function bootstrapRequest(body: unknown = payload, secret: string | null = bootstrapSecret): Request {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (secret !== null) headers.set('x-bootstrap-secret', secret)
  return new Request('https://selleros.xxx/api/internal/bootstrap-owner', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('first OWNER bootstrap', () => {
  it('rejects a request without the bootstrap secret', async () => {
    const response = await handleRequest(bootstrapRequest(payload, null), makeEnv())
    expect(response.status).toBe(403)
  })

  it('rejects an incorrect bootstrap secret', async () => {
    const response = await handleRequest(bootstrapRequest(payload, 'incorrect-secret'), makeEnv())
    expect(response.status).toBe(403)
  })

  it('rejects invalid or unexpected payload fields', async () => {
    for (const invalid of [
      { ...payload, email: 'invalid' },
      { ...payload, password: 'weak' },
      { ...payload, workspaceName: '' },
      { ...payload, unexpected: true },
    ]) {
      const response = await handleRequest(bootstrapRequest(invalid), makeEnv())
      expect(response.status).toBe(400)
    }
  })

  it('stores the password only as the existing secure hash format', async () => {
    const db = new FakeDb()
    const response = await handleRequest(bootstrapRequest(), makeEnv(db))
    expect(response.status).toBe(201)
    expect(db.users[0].password_hash).not.toBe(password)
    expect(db.users[0].password_hash).toMatch(/^pbkdf2_sha256\$/)
    expect(await verifyPassword(password, db.users[0].password_hash)).toBe(true)
  })

  it('creates the requested OWNER user', async () => {
    const db = new FakeDb()
    const response = await handleRequest(bootstrapRequest(), makeEnv(db))
    expect(response.status).toBe(201)
    expect(db.users).toHaveLength(1)
    expect(await response.json()).toMatchObject({ created: true, user: { email: payload.email }, role: 'OWNER' })
  })

  it('creates the workspace', async () => {
    const db = new FakeDb()
    await handleRequest(bootstrapRequest(), makeEnv(db))
    expect(db.workspaces).toHaveLength(1)
    expect(db.workspaces[0].name).toBe(payload.workspaceName)
  })

  it('creates the OWNER membership and audit record', async () => {
    const db = new FakeDb()
    await handleRequest(bootstrapRequest(), makeEnv(db))
    expect(db.memberships).toEqual([{ workspace_id: db.workspaces[0].id, user_id: db.users[0].id, role: 'OWNER' }])
    expect(db.audits).toMatchObject([{ workspace_id: db.workspaces[0].id, actor_id: db.users[0].id, action: 'OWNER_BOOTSTRAPPED' }])
  })

  it('permanently rejects a second attempt', async () => {
    const db = new FakeDb()
    const env = makeEnv(db)
    expect((await handleRequest(bootstrapRequest(), env)).status).toBe(201)
    const response = await handleRequest(bootstrapRequest({ ...payload, email: 'second@example.com' }), env)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: 'BOOTSTRAP_ALREADY_COMPLETED' } })
    expect(db.users).toHaveLength(1)
  })

  it('never exposes passwords, hashes, or secrets in the response', async () => {
    const response = await handleRequest(bootstrapRequest(), makeEnv())
    const body = await response.text()
    expect(body).not.toContain(password)
    expect(body).not.toContain(bootstrapSecret)
    expect(body).not.toContain('password_hash')
    expect(body).not.toContain('SESSION_SECRET')
    expect(body).not.toContain('OWNER_BOOTSTRAP_SECRET')
  })
})
