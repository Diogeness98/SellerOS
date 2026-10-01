import type { D1Database } from './types'

type RateLimitRow = { request_count: number }

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export async function rateLimitKey(scope: string, subject: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${scope}:${subject}`))
  return bytesToBase64Url(new Uint8Array(signature))
}

export async function takeRateLimit(db: D1Database, scope: string, subject: string, secret: string, limit: number, windowMs: number, now = new Date()): Promise<boolean> {
  const key = await rateLimitKey(scope, subject, secret)
  const current = now.toISOString()
  const resetBefore = new Date(now.getTime() - windowMs).toISOString()
  const expiresAt = new Date(now.getTime() + windowMs).toISOString()
  const row = await db.prepare(`INSERT INTO rate_limits (bucket_key, window_started_at, request_count, expires_at)
    VALUES (?1, ?2, 1, ?3)
    ON CONFLICT(bucket_key) DO UPDATE SET
      window_started_at = CASE WHEN rate_limits.window_started_at <= ?4 THEN excluded.window_started_at ELSE rate_limits.window_started_at END,
      request_count = CASE WHEN rate_limits.window_started_at <= ?4 THEN 1 ELSE rate_limits.request_count + 1 END,
      expires_at = excluded.expires_at,
      updated_at = datetime('now')
    RETURNING request_count`).bind(key, current, expiresAt, resetBefore).first<RateLimitRow>()
  return row !== null && row.request_count <= limit
}
