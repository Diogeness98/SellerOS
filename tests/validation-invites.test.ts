import { describe, expect, it } from 'vitest'
import { canAccessWorkspace, verifyPassword } from '../shared/auth'
import { isInvitePasswordValid } from '../shared/password-policy'
import { handleRequest } from '../worker/api'
import { hashInviteToken, validateInviteRegistration } from '../worker/invites'
import type { D1Database, D1Result, D1Statement, Env } from '../worker/types'

type StoredInvite = { id: string; tokenHash: string; expiresAt: string; usedAt: string | null; usedBy: string | null }
type User = { id: string; email: string; passwordHash: string }
type FailurePoint = 'user' | 'workspace' | 'membership'

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
  fkOrderingVerified = false

  constructor(readonly invite: StoredInvite, readonly failure?: FailurePoint) {}

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
    if (!batch[0].query.startsWith('INSERT INTO users') || !batch[5].query.startsWith('UPDATE validation_invites')) throw new Error('foreign key ordering violation')
    const [userId, email, passwordHash, tokenHash, now] = batch[0].values as string[]
    const eligible = this.invite.tokenHash === tokenHash && !this.invite.usedAt && this.invite.expiresAt > now
    if (!eligible) return batch.map(() => ({ results: [] as T[], success: true, meta: { changes: 0 } }))
    if (this.failure === 'user' || this.users.some((item) => item.email === email)) throw new Error('user insert failed')
    const users = [...this.users, { id: userId, email, passwordHash }]
    if (this.failure === 'workspace') throw new Error('workspace insert failed')
    const [workspaceId, name] = batch[1].values as string[]
    const workspaces = [...this.workspaces, { id: workspaceId, name }]
    if (this.failure === 'membership') throw new Error('membership insert failed')
    const members = [...this.members, { workspaceId, userId, role: 'OWNER' }]
    if (!users.some((item) => item.id === userId)) throw new Error('foreign key violation')
    this.fkOrderingVerified = true
    this.users = users; this.workspaces = workspaces; this.members = members
    this.audit = [...this.audit, { action: 'VALIDATION_SELLER_REGISTERED' }]
    this.events = [...this.events, { name: 'validation_signup_completed' }]
    this.invite.usedAt = now; this.invite.usedBy = userId
    return batch.map(() => ({ results: [] as T[], success: true, meta: { changes: 1 } }))
  }
}

const secret = 'test-session-secret-with-at-least-32-chars'
const token = 'a'.repeat(43)

async function createDb(expiresAt = new Date(Date.now() + 60_000).toISOString(), failure?: FailurePoint) {
  return new RegistrationDb({ id: 'invite-1', tokenHash: await hashInviteToken(token), expiresAt, usedAt: null, usedBy: null }, failure)
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
    expect(isInvitePasswordValid(validBody.password)).toBe(true)
    expect(isInvitePasswordValid('weak')).toBe(false)
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
    expect(db.fkOrderingVerified).toBe(true)
    expect(db.users).toHaveLength(1)
    expect(db.users[0].passwordHash).not.toBe(validBody.password)
    expect(await verifyPassword(validBody.password, db.users[0].passwordHash)).toBe(true)
    expect(db.workspaces).toEqual([{ id: body.workspaceId, name: 'Seller validation' }])
    expect(db.members).toEqual([{ workspaceId: body.workspaceId, userId: body.user.id, role: 'OWNER' }])
    expect(db.audit).toEqual([{ action: 'VALIDATION_SELLER_REGISTERED' }])
    expect(db.events).toEqual([{ name: 'validation_signup_completed' }])
    expect(db.invite.usedBy).toBe(body.user.id)
    expect(db.users.some((user) => user.id === db.invite.usedBy)).toBe(true)
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

  it('does not consume an invite when duplicate or failed writes roll back', async () => {
    const duplicate = await createDb()
    duplicate.users.push({ id: 'existing-user', email: validBody.email, passwordHash: 'hash' })
    expect((await handleRequest(registrationRequest(validBody), env(duplicate))).status).toBe(400)
    expect(duplicate.invite.usedAt).toBeNull()

    for (const failure of ['user', 'workspace', 'membership'] as const) {
      const db = await createDb(undefined, failure)
      expect((await handleRequest(registrationRequest(validBody), env(db))).status).toBe(500)
      expect(db.users).toHaveLength(0)
      expect(db.workspaces).toHaveLength(0)
      expect(db.members).toHaveLength(0)
      expect(db.invite.usedAt).toBeNull()
      expect(db.invite.usedBy).toBeNull()
    }
  })
})
