import { canAccessWorkspace, canManageWorkspace, createSession, SESSION_COOKIE } from '../shared/auth'
import type { Role, Session } from '../shared/types'
import type { Env } from './types'

type UserRow = { id: string; email: string; password_hash: string }
type MembershipRow = { workspace_id: string; role: Role }

const json = (body: unknown, status = 200, requestId = crypto.randomUUID()) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
  })

const error = (code: string, message: string, status: number, requestId = crypto.randomUUID()) =>
  json({ error: { code, message, requestId } }, status, requestId)

function readSession(request: Request): Session | null {
  const raw = request.headers.get('cookie')?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1]
  if (!raw) return null
  try {
    return JSON.parse(atob(raw)) as Session
  } catch {
    return null
  }
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true, service: 'selleros-worker' })

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null
    if (!body?.email || !body.password) return error('VALIDATION_ERROR', 'email and password are required', 400)
    const user = await env.DB.prepare('SELECT id, email, password_hash FROM users WHERE email = ?1').bind(body.email).first<UserRow>()
    if (!user || user.password_hash !== body.password) return error('UNAUTHORIZED', 'Invalid credentials', 401)
    const membership = await env.DB.prepare('SELECT workspace_id, role FROM workspace_members WHERE user_id = ?1 LIMIT 1').bind(user.id).first<MembershipRow>()
    if (!membership) return error('WORKSPACE_REQUIRED', 'User has no workspace membership', 403)
    const session = createSession(user.id, membership.workspace_id, membership.role)
    const encoded = btoa(JSON.stringify(session))
    return new Response(JSON.stringify({ user: { id: user.id, email: user.email }, workspaceId: membership.workspace_id }), {
      headers: { 'content-type': 'application/json', 'set-cookie': `${SESSION_COOKIE}=${encoded}; HttpOnly; Secure; SameSite=Lax; Path=/` },
    })
  }

  if (url.pathname.startsWith('/api/workspaces/')) {
    const workspaceId = url.pathname.split('/')[3]
    const session = readSession(request)
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
