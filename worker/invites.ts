export type InviteRegistration = { inviteToken: string; email: string; password: string; workspaceName: string }
export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
export function validateInviteRegistration(input: InviteRegistration): string | null {
  if (!/^[A-Za-z0-9_-]{43,}$/.test(input.inviteToken)) return 'INVITE_INVALID'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return 'REGISTRATION_FAILED'
  if (!isInvitePasswordValid(input.password)) return 'REGISTRATION_FAILED'
  if (!input.workspaceName.trim() || input.workspaceName.trim().length > 120 || input.email.length > 254) return 'REGISTRATION_FAILED'
  return null
}
import { isInvitePasswordValid } from '../shared/password-policy'

