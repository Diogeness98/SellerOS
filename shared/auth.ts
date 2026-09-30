import type { Role, Session } from './types'

export const SESSION_COOKIE = 'selleros_session'
const PASSWORD_HASH_PREFIX = 'pbkdf2_sha256'
// Cloudflare Workers Web Crypto rejects PBKDF2 iteration counts above 100,000.
const PASSWORD_ITERATIONS = 100_000
const PASSWORD_SALT_BYTES = 16
const PASSWORD_KEY_BYTES = 32
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
  return base64ToBytes(padded)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer
}

async function derivePasswordKey(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' }, key, PASSWORD_KEY_BYTES * 8)
}

async function constantTimeEqual(left: Uint8Array, right: Uint8Array): Promise<boolean> {
  if (left.length !== right.length) return false
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, true, ['sign', 'verify'])
  const signature = await crypto.subtle.sign('HMAC', key, toArrayBuffer(left))
  return crypto.subtle.verify('HMAC', key, signature, toArrayBuffer(right))
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES))
  const derived = new Uint8Array(await derivePasswordKey(password, salt, PASSWORD_ITERATIONS))
  return [PASSWORD_HASH_PREFIX, PASSWORD_ITERATIONS, bytesToBase64(salt), bytesToBase64(derived)].join('$')
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [prefix, iterationValue, encodedSalt, encodedHash] = storedHash.split('$')
  const iterations = Number(iterationValue)
  if (prefix !== PASSWORD_HASH_PREFIX || !Number.isSafeInteger(iterations) || iterations < 1 || !encodedSalt || !encodedHash) return false
  try {
    const expected = base64ToBytes(encodedHash)
    const actual = new Uint8Array(await derivePasswordKey(password, base64ToBytes(encodedSalt), iterations))
    return constantTimeEqual(actual, expected)
  } catch {
    return false
  }
}

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
  return Boolean(
    session &&
      typeof session.userId === 'string' &&
      typeof session.workspaceId === 'string' &&
      isRole(session.role) &&
      Number.isFinite(new Date(session.expiresAt).getTime()) &&
      new Date(session.expiresAt).getTime() > now.getTime(),
  )
}

function isRole(value: unknown): value is Role {
  return value === 'OWNER' || value === 'ADMIN' || value === 'MANAGER' || value === 'OPERATOR' || value === 'VIEWER'
}

async function signSessionPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return bytesToBase64Url(new Uint8Array(signature))
}

export async function createSessionToken(session: Session, secret: string): Promise<string> {
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters')
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(session)))
  return `${payload}.${await signSessionPayload(payload, secret)}`
}

export async function readSessionToken(token: string, secret: string, now = new Date()): Promise<Session | null> {
  if (secret.length < 32) return null
  const [payload, signature, ...extra] = token.split('.')
  if (!payload || !signature || extra.length > 0) return null
  try {
    const expectedSignature = await signSessionPayload(payload, secret)
    const validSignature = await constantTimeEqual(base64UrlToBytes(signature), base64UrlToBytes(expectedSignature))
    if (!validSignature) return null
    const session = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as Session
    return isSessionValid(session, now) ? session : null
  } catch {
    return null
  }
}

export const SESSION_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS
