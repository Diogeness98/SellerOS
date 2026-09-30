import type { Role, Session } from './types'

export const SESSION_COOKIE = 'selleros_session'

export function canAccessWorkspace(session: Session | null, workspaceId: string): boolean {
  return session !== null && session.workspaceId === workspaceId
}

export function canManageWorkspace(role: Role): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}

export function createSession(userId: string, workspaceId: string, role: Role, now = new Date()): Session {
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString()
  return { userId, workspaceId, role, expiresAt }
}

export function isSessionValid(session: Session, now = new Date()): boolean {
  return new Date(session.expiresAt).getTime() > now.getTime()
}
