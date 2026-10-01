import { describe, expect, it } from 'vitest'
import { canAccessWorkspace, verifyPassword } from '../shared/auth'
import { handleRequest } from '../worker/api'
import { hashInviteToken, validateInviteRegistration } from '../worker/invites'
import type { D1Database, D1Result, D1Statement, Env } from '../worker/types'

type StoredInvite = { id: string; tokenHash: string; expiresAt: string; usedAt: string | null; usedBy: string | null }
type User = { id: string; email: string; passwordHash: string }

class RegistrationStatement implements D1Statement {
  constructor(readonly db: RegistrationDb, readonly query: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]): D1Statement { return new RegistrationStatement(this.db, this.query, values) }
  async first<T>(): Promise<T | null> { return this.db.first<T>(this.query, this.values) }
  async all<T>(): Promise<D1Result<T>> { return { results: [], success: true } }
  async run(): Promise<D1Result> { return { results: [], success: true } }
}

class RegistrationDb implements D1Database {
  users: User[] = []
  workspaces: Array<{ id: string; name: string }> = []
  members: Array<{ workspaceId: string; userId: string; role: string }> = []
  audit: Array<{ action: string }> = []
  events: Array<{ name: string }> = []

  constructor(readonly invite: StoredInvite) {}

  prepare(query: string): D1Statement { return new RegistrationStatement(this, query) }

  async first<T>(query: string, values: unknown[]): Promise<T | null> {
    if (query.includes('FROM validation_invites')) {
      return this.invite.tokenHash === values[0] ? { id: this.invite.id, expires_at: this.invite.expiresAt, used_at: this.invite.usedAt } as T : null
    }
    if (query.includes('SELECT id FROM users')) {
      const user = this.users.find((item) => item.email === values[0])
      return user ? { id: user.id } as T : null
    }
    return null
  }

  async batch<T = unknown>(statements: D1Statement[]): Promise<D1Result<T>[]> {
    const batch = statements as RegistrationStatement[]
    const [usedAt, userId] = batch[0].values as string[]
    const eligible = !this.invite.usedAt && this.invite.expiresAt > usedAt
    if (!eligible) return batch.map((_, index) => ({ results: [] as T[], success: true, meta: { changes: index === 0 ? 0 : 0 } }))
    const [, email, passwordHash] = batch[1].values as string[]
    if (this.users.some((item) => item.email === email)) throw new Error('UNIQUE constraint failed: users.email')
    this.invite.usedAt = usedAt; this.invite.usedBy = userId
    this.users.push({ id: userId, email, passwordHash })
    const [workspaceId, name] = batch[2].values as string[]
    this.workspaces.push({ id: workspaceId, name })
    this.members.push({ workspaceId, userId, role: 'OWNER' })
    this.audit.push({ action: 'VALIDATION_SELLER_REGISTERED' })
    this.events.push({ name: 'validation_signup_completed' })
    return batch.map((_, index) => ({ results: [] as T[], success: true, meta: { changes: index === 0 ? 1 : 1 } }))
  }
}

const secret = 'test-session-secret-with-at-least-32-chars'
const token = 'a'.repeat(43)

async function createDb(expiresAt = new Date(Date.now() + 60_000).toISOString()) {
  return new RegistrationDb({ id: 'invite-1', tokenHash: await hashInviteToken(token), expiresAt, usedAt: null, usedBy: null })
}

function env(db: RegistrationDb): Env { return { DB: db, SESSION_SECRET: secret } }
function registrationRequest(body: Record<string, string>, origin?: string) {
  return new Request('https://selleros.example/api/auth/register-from-invite', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) })
}
const validBody = { inviteToken: token, email: 'seller@example.com', password: 'StrongPass1', workspaceName: 'Seller validation' }

describe('validation seller onboarding', () => {
  it('hashes invitation tokens and validates only bounded registration input', async () => {
    expect(await hashInviteToken(token)).not.toContain(token)
    expect(await hashInviteToken(token)).not.toBe(await hashInviteToken('b'.repeat(43)))
    expect(validateInviteRegistration(validBody)).toBeNull()
    expect(validateInviteRegistration({ ...validBody, inviteToken: 'bad' })).toBe('INVITE_INVALID')
    expect(validateInviteRegistration({ ...validBody, password: 'weak' })).toBe('REGISTRATION_FAILED')
  })

  it('creates an isolated OWNER workspace with a hashed password and signed session', async () => {
    const db = await createDb()
    const response = await handleRequest(registrationRequest(validBody), env(db))
    const body = await response.json() as { user: { id: string; email: string }; workspaceId: string }
    expect(response.status).toBe(201)
    expect(body.user.email).toBe('seller@example.com')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Lax; Path=/')
    expect(db.users).toHaveLength(1)
    expect(db.users[0].passwordHash).not.toBe(validBody.password)
    expect(await verifyPassword(validBody.password, db.users[0].passwordHash)).toBe(true)
    expect(db.workspaces).toEqual([{ id: body.workspaceId, name: 'Seller validation' }])
    expect(db.members).toEqual([{ workspaceId: body.workspaceId, userId: body.user.id, role: 'OWNER' }])
    expect(db.audit).toEqual([{ action: 'VALIDATION_SELLER_REGISTERED' }])
    expect(db.events).toEqual([{ name: 'validation_signup_completed' }])
    expect(db.invite.tokenHash).not.toContain(token)
    expect(JSON.stringify(body)).not.toContain(token)
    expect(canAccessWorkspace({ userId: body.user.id, workspaceId: body.workspaceId, role: 'OWNER', expiresAt: '2999-01-01T00:00:00.000Z' }, 'other-workspace')).toBe(false)
  })

  it('rejects expired, consumed, invalid and cross-origin invitations without creating an account', async () => {
    const expired = await createDb(new Date(Date.now() - 60_000).toISOString())
    expect((await handleRequest(registrationRequest(validBody), env(expired))).status).toBe(400)
    expect(expired.users).toHaveLength(0)

    const db = await createDb()
    expect((await handleRequest(registrationRequest({ ...validBody, inviteToken: 'b'.repeat(43) }), env(db))).status).toBe(400)
    expect((await handleRequest(registrationRequest(validBody, 'https://attacker.example'), env(db))).status).toBe(403)
    expect((await handleRequest(registrationRequest(validBody), env(db))).status).toBe(201)
    const second = await handleRequest(registrationRequest({ ...validBody, email: 'another@example.com' }), env(db))
    expect(second.status).toBe(400)
    expect(db.users).toHaveLength(1)
    expect(db.workspaces).toHaveLength(1)
  })
})
