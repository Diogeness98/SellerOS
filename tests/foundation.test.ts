import { describe, expect, it } from 'vitest'
import { canAccessWorkspace, canManageWorkspace, createSession, createSessionToken, hashPassword, isSessionValid, readSessionToken, verifyPassword } from '../shared/auth'

describe('auth foundation', () => {
  it('creates a time-limited session', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const session = createSession('user-1', 'workspace-1', 'OWNER', now)
    expect(session.expiresAt).toBe('2026-01-01T08:00:00.000Z')
    expect(isSessionValid(session, new Date('2026-01-01T07:59:59.000Z'))).toBe(true)
    expect(isSessionValid(session, new Date('2026-01-01T08:00:00.000Z'))).toBe(false)
  })

  it('prevents access to a different workspace', () => {
    const session = createSession('user-1', 'workspace-a', 'VIEWER')
    expect(canAccessWorkspace(session, 'workspace-a')).toBe(true)
    expect(canAccessWorkspace(session, 'workspace-b')).toBe(false)
  })

  it('keeps roles without management permission blocked', () => {
    expect(canManageWorkspace('OWNER')).toBe(true)
    expect(canManageWorkspace('ADMIN')).toBe(true)
    expect(canManageWorkspace('OPERATOR')).toBe(false)
  })

  it('accepts the correct password and rejects an incorrect one', async () => {
    const hash = await hashPassword('correct-password')
    expect(await verifyPassword('correct-password', hash)).toBe(true)
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('uses a different salt for each password hash', async () => {
    const first = await hashPassword('same-password')
    const second = await hashPassword('same-password')
    expect(first).not.toBe(second)
  })

  it('accepts a valid signed session', async () => {
    const secret = 'test-session-secret-with-at-least-32-chars'
    const session = createSession('user-1', 'workspace-a', 'OWNER', new Date('2026-01-01T00:00:00.000Z'))
    const token = await createSessionToken(session, secret)
    expect(await readSessionToken(token, secret, new Date('2026-01-01T01:00:00.000Z'))).toEqual(session)
  })

  it('rejects a tampered signed session', async () => {
    const secret = 'test-session-secret-with-at-least-32-chars'
    const session = createSession('user-1', 'workspace-a', 'OWNER', new Date('2026-01-01T00:00:00.000Z'))
    const token = await createSessionToken(session, secret)
    expect(await readSessionToken(`${token.slice(0, -1)}x`, secret, new Date('2026-01-01T01:00:00.000Z'))).toBeNull()
  })

  it('rejects an expired signed session', async () => {
    const secret = 'test-session-secret-with-at-least-32-chars'
    const session = createSession('user-1', 'workspace-a', 'OWNER', new Date('2026-01-01T00:00:00.000Z'))
    const token = await createSessionToken(session, secret)
    expect(await readSessionToken(token, secret, new Date('2026-01-01T09:00:00.000Z'))).toBeNull()
  })
})
