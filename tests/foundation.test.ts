import { describe, expect, it } from 'vitest'
import { canAccessWorkspace, canManageWorkspace, createSession, isSessionValid } from '../shared/auth'

describe('auth foundation', () => {
  it('creates a time-limited session', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const session = createSession('user-1', 'workspace-1', 'OWNER', now)
    expect(session.expiresAt).toBe('2026-01-01T08:00:00.000Z')
    expect(isSessionValid(session, new Date('2026-01-01T07:59:59.000Z'))).toBe(true)
    expect(isSessionValid(session, new Date('2026-01-01T08:00:00.000Z'))).toBe(false)
  })

  it('isolates workspaces and applies foundation RBAC', () => {
    const session = createSession('user-1', 'workspace-a', 'VIEWER')
    expect(canAccessWorkspace(session, 'workspace-a')).toBe(true)
    expect(canAccessWorkspace(session, 'workspace-b')).toBe(false)
    expect(canManageWorkspace('OWNER')).toBe(true)
    expect(canManageWorkspace('ADMIN')).toBe(true)
    expect(canManageWorkspace('OPERATOR')).toBe(false)
  })
})
