import { canAccessWorkspace, canManageWorkspace, createSession, createSessionToken, readSessionToken, SESSION_COOKIE, SESSION_COOKIE_MAX_AGE, verifyPassword } from '../shared/auth'
import type { Role, Session } from '../shared/types'
import { createCodeChallenge, createCodeVerifier, createOAuthState } from '../shared/oauth'
import { encryptToken } from './crypto'
import { exchangeAuthorizationCode, fetchMercadoLivreUser, MercadoLivreApiError, MERCADOLIVRE_AUTHORIZATION_URL } from './mercadolivre'
import { MercadoLivreSyncService, SyncError } from './sync'
import type { Env } from './types'

type UserRow = { id: string; email: string; password_hash: string }
type SessionUserRow = { id: string; email: string }
type MembershipRow = { workspace_id: string; role: Role }
type OAuthAttemptRow = { state: string; user_id: string; workspace_id: string; code_verifier: string; expires_at: string; consumed_at: string | null }
type IntegrationRow = { id: string; workspace_id: string; channel: string; status: string; external_account_id: string | null; token_expires_at: string | null; last_sync_at: string | null }
type SyncJobRow = { id: string; status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED'; records_seen: number; records_created: number; records_updated: number; records_failed: number; started_at: string | null; finished_at: string | null }

const json = (body: unknown, status = 200, requestId = crypto.randomUUID()) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
  })

const error = (code: string, message: string, status: number, requestId = crypto.randomUUID()) =>
  json({ error: { code, message, requestId } }, status, requestId)

const mercadoLivreConfig = (env: Env) => ({
  clientId: env.MERCADOLIVRE_CLIENT_ID,
  clientSecret: env.MERCADOLIVRE_CLIENT_SECRET,
  redirectUri: env.MERCADOLIVRE_REDIRECT_URI,
  tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
})

async function readSession(request: Request, secret: string): Promise<Session | null> {
  const raw = request.headers.get('cookie')?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1]
  if (!raw) return null
  return readSessionToken(raw, secret)
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true, service: 'selleros-worker' })

  if (request.method === 'GET' && url.pathname === '/api/auth/session') {
    const session = await readSession(request, env.SESSION_SECRET)
    if (!session) return json({ authenticated: false })
    const user = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?1').bind(session.userId).first<SessionUserRow>()
    if (!user) return json({ authenticated: false })
    return json({ authenticated: true, user: { id: user.id, email: user.email }, workspaceId: session.workspaceId })
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    return new Response(JSON.stringify({ loggedOut: true }), {
      headers: { 'content-type': 'application/json', 'set-cookie': `${SESSION_COOKIE}=; Max-Age=0; Expires=${new Date(0).toUTCString()}; HttpOnly; Secure; SameSite=Lax; Path=/` },
    })
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null
    if (!body?.email || !body.password) return error('VALIDATION_ERROR', 'email and password are required', 400)
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return error('CONFIGURATION_ERROR', 'SESSION_SECRET must be at least 32 characters', 503)
    const user = await env.DB.prepare('SELECT id, email, password_hash FROM users WHERE email = ?1').bind(body.email).first<UserRow>()
    if (!user || !(await verifyPassword(body.password, user.password_hash))) return error('UNAUTHORIZED', 'Invalid credentials', 401)
    const membership = await env.DB.prepare('SELECT workspace_id, role FROM workspace_members WHERE user_id = ?1 LIMIT 1').bind(user.id).first<MembershipRow>()
    if (!membership) return error('WORKSPACE_REQUIRED', 'User has no workspace membership', 403)
    const session = createSession(user.id, membership.workspace_id, membership.role)
    const encoded = await createSessionToken(session, env.SESSION_SECRET)
    const expires = new Date(Date.now() + SESSION_COOKIE_MAX_AGE * 1000).toUTCString()
    return new Response(JSON.stringify({ user: { id: user.id, email: user.email }, workspaceId: membership.workspace_id }), {
      headers: { 'content-type': 'application/json', 'set-cookie': `${SESSION_COOKIE}=${encoded}; Max-Age=${SESSION_COOKIE_MAX_AGE}; Expires=${expires}; HttpOnly; Secure; SameSite=Lax; Path=/` },
    })
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations/mercadolivre/connect') {
    const session = await readSession(request, env.SESSION_SECRET)
    if (!session) return error('FORBIDDEN', 'Authentication required', 403)
    const config = mercadoLivreConfig(env)
    if (!config.clientId || !config.redirectUri) return error('CONFIGURATION_ERROR', 'Mercado Livre OAuth is not configured', 503)
    const state = createOAuthState()
    const codeVerifier = createCodeVerifier()
    const codeChallenge = await createCodeChallenge(codeVerifier)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    await env.DB.prepare('INSERT INTO oauth_attempts (state, user_id, workspace_id, code_verifier, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(state, session.userId, session.workspaceId, codeVerifier, expiresAt)
      .run()
    const authorizationUrl = new URL(MERCADOLIVRE_AUTHORIZATION_URL)
    authorizationUrl.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: config.redirectUri, state, code_challenge: codeChallenge, code_challenge_method: 'S256' }).toString()
    return Response.redirect(authorizationUrl.toString(), 302)
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations/mercadolivre/callback') {
    const session = await readSession(request, env.SESSION_SECRET)
    if (!session) return error('FORBIDDEN', 'Authentication required', 403)
    const state = url.searchParams.get('state')
    const code = url.searchParams.get('code')
    if (!state || !code) return error('VALIDATION_ERROR', 'code and state are required', 400)
    const attempt = await env.DB.prepare('SELECT state, user_id, workspace_id, code_verifier, expires_at, consumed_at FROM oauth_attempts WHERE state = ?1').bind(state).first<OAuthAttemptRow>()
    if (!attempt || attempt.user_id !== session.userId || attempt.workspace_id !== session.workspaceId || attempt.consumed_at || new Date(attempt.expires_at).getTime() <= Date.now()) return error('OAUTH_STATE_INVALID', 'OAuth attempt is invalid or expired', 400)
    const consumed = await env.DB.prepare('UPDATE oauth_attempts SET consumed_at = ?1 WHERE state = ?2 AND consumed_at IS NULL AND expires_at > ?3')
      .bind(new Date().toISOString(), state, new Date().toISOString())
      .run()
    if (consumed.meta && typeof consumed.meta.changes === 'number' && consumed.meta.changes !== 1) return error('OAUTH_STATE_INVALID', 'OAuth attempt is invalid or already used', 400)
    const config = mercadoLivreConfig(env)
    if (!config.clientId || !config.clientSecret || !config.redirectUri || !config.tokenEncryptionKey) return error('CONFIGURATION_ERROR', 'Mercado Livre OAuth is not configured', 503)
    try {
      const token = await exchangeAuthorizationCode({ clientId: config.clientId, clientSecret: config.clientSecret, code, redirectUri: config.redirectUri, codeVerifier: attempt.code_verifier })
      const user = await fetchMercadoLivreUser(token.access_token)
      const accessTokenEncrypted = await encryptToken(token.access_token, config.tokenEncryptionKey)
      const refreshTokenEncrypted = await encryptToken(token.refresh_token, config.tokenEncryptionKey)
      const tokenExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString()
      await env.DB.prepare(`INSERT INTO integrations (id, workspace_id, channel, status, external_account_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes)
        VALUES (?1, ?2, 'MERCADOLIVRE', 'CONNECTED', ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(workspace_id, channel) DO UPDATE SET status = 'CONNECTED', external_account_id = excluded.external_account_id, access_token_encrypted = excluded.access_token_encrypted, refresh_token_encrypted = excluded.refresh_token_encrypted, token_expires_at = excluded.token_expires_at, scopes = excluded.scopes, updated_at = datetime('now')`)
        .bind(crypto.randomUUID(), session.workspaceId, user.id, accessTokenEncrypted, refreshTokenEncrypted, tokenExpiresAt, token.scope ?? null)
        .run()
      return Response.redirect(new URL('/?mercadolivre=connected', url.origin).toString(), 302)
    } catch (cause) {
      if (cause instanceof MercadoLivreApiError) {
        console.error('Mercado Livre OAuth failed', { stage: cause.stage, status: cause.status, errorCode: cause.errorCode, requestId: cause.requestId })
      } else {
        console.error('Mercado Livre OAuth failed', { stage: 'unknown' })
      }
      return error('OAUTH_EXCHANGE_FAILED', 'Mercado Livre authorization could not be completed', 502)
    }
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations/mercadolivre/status') {
    const session = await readSession(request, env.SESSION_SECRET)
    if (!session) return error('FORBIDDEN', 'Authentication required', 403)
    const integration = await env.DB.prepare("SELECT id, workspace_id, channel, status, external_account_id, token_expires_at, last_sync_at FROM integrations WHERE workspace_id = ?1 AND channel = 'MERCADOLIVRE'").bind(session.workspaceId).first<IntegrationRow>()
    return json({ connected: integration?.status === 'CONNECTED', channel: 'MERCADOLIVRE', externalAccountId: integration?.external_account_id ?? null, tokenExpiresAt: integration?.token_expires_at ?? null, lastSyncAt: integration?.last_sync_at ?? null })
  }

  if (request.method === 'POST' && url.pathname === '/api/integrations/mercadolivre/sync') {
    const session = await readSession(request, env.SESSION_SECRET)
    if (!session) return error('FORBIDDEN', 'Authentication required', 403)
    if (!canManageWorkspace(session.role)) return error('FORBIDDEN', 'Insufficient permissions', 403)
    try {
      const result = await new MercadoLivreSyncService({
        db: env.DB,
        clientId: env.MERCADOLIVRE_CLIENT_ID,
        clientSecret: env.MERCADOLIVRE_CLIENT_SECRET,
        tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
      }).sync(session.workspaceId)
      return json(result)
    } catch (cause) {
      if (cause instanceof SyncError && cause.code === 'SYNC_IN_PROGRESS') return error('SYNC_IN_PROGRESS', 'A sync is already running', 409)
      if (cause instanceof SyncError && cause.code === 'INTEGRATION_NOT_CONNECTED') return error('INTEGRATION_NOT_CONNECTED', 'Mercado Livre is not connected', 409)
      if (cause instanceof SyncError && cause.code === 'SYNC_CONFIGURATION_ERROR') return error('CONFIGURATION_ERROR', 'Mercado Livre sync is not configured', 503)
      return error('SYNC_FAILED', 'Mercado Livre sync could not be completed', 502)
    }
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations/mercadolivre/sync/status') {
    const session = await readSession(request, env.SESSION_SECRET)
    if (!session) return error('FORBIDDEN', 'Authentication required', 403)
    const job = await env.DB.prepare("SELECT id, status, records_seen, records_created, records_updated, records_failed, started_at, finished_at FROM sync_jobs WHERE workspace_id = ?1 AND channel = 'MERCADOLIVRE' ORDER BY created_at DESC LIMIT 1")
      .bind(session.workspaceId)
      .first<SyncJobRow>()
    if (!job) return json({ job: null })
    return json({ job: { jobId: job.id, status: job.status, recordsSeen: job.records_seen, created: job.records_created, updated: job.records_updated, failed: job.records_failed, startedAt: job.started_at, finishedAt: job.finished_at } })
  }

  if (request.method === 'POST' && url.pathname === '/api/integrations/mercadolivre/disconnect') {
    const session = await readSession(request, env.SESSION_SECRET)
    if (!session) return error('FORBIDDEN', 'Authentication required', 403)
    await env.DB.prepare("UPDATE integrations SET status = 'DISCONNECTED', access_token_encrypted = NULL, refresh_token_encrypted = NULL, token_expires_at = NULL, updated_at = datetime('now') WHERE workspace_id = ?1 AND channel = 'MERCADOLIVRE'").bind(session.workspaceId).run()
    await env.DB.prepare("INSERT INTO audit_logs (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, source) VALUES (?1, ?2, 'USER', ?3, 'INTEGRATION_DISCONNECTED', 'INTEGRATION', 'MERCADOLIVRE', 'selleros')").bind(crypto.randomUUID(), session.workspaceId, session.userId).run()
    return json({ disconnected: true, channel: 'MERCADOLIVRE' })
  }

  if (url.pathname.startsWith('/api/workspaces/')) {
    const workspaceId = url.pathname.split('/')[3]
    const session = await readSession(request, env.SESSION_SECRET)
    if (!session || !canAccessWorkspace(session, workspaceId)) return error('FORBIDDEN', 'Workspace access denied', 403)
    if (request.method === 'GET') {
      const workspace = await env.DB.prepare('SELECT id, name, created_at FROM workspaces WHERE id = ?1').bind(workspaceId).first()
      return workspace ? json(workspace) : error('NOT_FOUND', 'Workspace not found', 404)
    }
    if (request.method === 'PATCH' && canManageWorkspace(session.role)) {
      const body = (await request.json().catch(() => null)) as { name?: string } | null
      if (!body?.name?.trim()) return error('VALIDATION_ERROR', 'name is required', 400)
      await env.DB.prepare('UPDATE workspaces SET name = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(body.name.trim(), workspaceId).run()
      return json({ id: workspaceId, name: body.name.trim() })
    }
    return error('FORBIDDEN', 'Insufficient permissions', 403)
  }

  return error('NOT_FOUND', 'Route not found', 404)
}
