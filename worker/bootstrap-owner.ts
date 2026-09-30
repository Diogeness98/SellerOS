import { hashPassword, secureStringEqual } from '../shared/auth'
import type { D1Result, Env } from './types'

type BootstrapStateRow = { has_user: number; has_owner: number }
type BootstrapPayload = { email: string; password: string; workspaceName: string }

const ALLOWED_FIELDS = new Set(['email', 'password', 'workspaceName'])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/

const json = (body: unknown, status = 200, requestId = crypto.randomUUID()) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
  })

const error = (code: string, message: string, status: number, requestId = crypto.randomUUID()) =>
  json({ error: { code, message, requestId } }, status, requestId)

function readPayload(value: unknown): BootstrapPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !ALLOWED_FIELDS.has(key))) return null
  if (typeof record.email !== 'string' || typeof record.password !== 'string' || typeof record.workspaceName !== 'string') return null

  const email = record.email.trim().toLowerCase()
  const workspaceName = record.workspaceName.trim()
  const password = record.password
  const validPassword =
    password.length >= 12 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password) &&
    !CONTROL_CHARACTER_PATTERN.test(password)

  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return null
  if (!validPassword) return null
  if (workspaceName.length < 2 || workspaceName.length > 100 || CONTROL_CHARACTER_PATTERN.test(workspaceName)) return null
  return { email, password, workspaceName }
}

function changed(result: D1Result | undefined): number {
  return typeof result?.meta?.changes === 'number' ? result.meta.changes : 0
}

async function bootstrapCompleted(env: Env): Promise<boolean> {
  const state = await env.DB.prepare(`SELECT
    EXISTS(SELECT 1 FROM users LIMIT 1) AS has_user,
    EXISTS(SELECT 1 FROM workspace_members WHERE role = 'OWNER' LIMIT 1) AS has_owner`).first<BootstrapStateRow>()
  return !state || Boolean(state.has_user || state.has_owner)
}

export async function bootstrapOwner(request: Request, env: Env): Promise<Response> {
  if (!env.OWNER_BOOTSTRAP_SECRET || env.OWNER_BOOTSTRAP_SECRET.length < 48) {
    return error('CONFIGURATION_ERROR', 'Owner bootstrap is not configured', 503)
  }

  const providedSecret = request.headers.get('x-bootstrap-secret')
  if (!providedSecret || !(await secureStringEqual(providedSecret, env.OWNER_BOOTSTRAP_SECRET))) {
    return error('BOOTSTRAP_UNAUTHORIZED', 'Bootstrap authorization failed', 403)
  }

  const payload = readPayload(await request.json().catch(() => null))
  if (!payload) {
    return error('VALIDATION_ERROR', 'email, password, and workspaceName are invalid', 400)
  }

  if (await bootstrapCompleted(env)) {
    return error('BOOTSTRAP_ALREADY_COMPLETED', 'Owner bootstrap has already been completed', 409)
  }

  const userId = crypto.randomUUID()
  const workspaceId = crypto.randomUUID()
  const auditId = crypto.randomUUID()
  const passwordHash = await hashPassword(payload.password)

  try {
    const results = await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash)
        SELECT ?1, ?2, ?3
        WHERE NOT EXISTS (SELECT 1 FROM users)
          AND NOT EXISTS (SELECT 1 FROM workspace_members WHERE role = 'OWNER')`)
        .bind(userId, payload.email, passwordHash),
      env.DB.prepare('INSERT INTO workspaces (id, name) VALUES (?1, ?2)').bind(workspaceId, payload.workspaceName),
      env.DB.prepare("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?1, ?2, 'OWNER')").bind(workspaceId, userId),
      env.DB.prepare("INSERT INTO audit_logs (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, source) VALUES (?1, ?2, 'USER', ?3, 'OWNER_BOOTSTRAPPED', 'WORKSPACE', ?2, 'selleros')")
        .bind(auditId, workspaceId, userId),
    ])

    if (results.length !== 4 || results.some((result) => changed(result) !== 1)) {
      if (await bootstrapCompleted(env)) return error('BOOTSTRAP_ALREADY_COMPLETED', 'Owner bootstrap has already been completed', 409)
      return error('BOOTSTRAP_FAILED', 'Owner bootstrap could not be completed', 500)
    }
  } catch {
    if (await bootstrapCompleted(env)) return error('BOOTSTRAP_ALREADY_COMPLETED', 'Owner bootstrap has already been completed', 409)
    return error('BOOTSTRAP_FAILED', 'Owner bootstrap could not be completed', 500)
  }

  return json({
    created: true,
    user: { id: userId, email: payload.email },
    workspace: { id: workspaceId, name: payload.workspaceName },
    role: 'OWNER',
  }, 201)
}
