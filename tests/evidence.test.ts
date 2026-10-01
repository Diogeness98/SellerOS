import { describe, expect, it, vi } from 'vitest'
import { createSession, createSessionToken } from '../shared/auth'
import { encryptToken } from '../worker/crypto'
import { downloadEvidenceAsset, EvidenceError, EvidenceSyncService, getEvidencePack } from '../worker/evidence'
import { handleRequest } from '../worker/api'
import type { D1Database, D1Result, D1Statement, Env } from '../worker/types'

const key = 'test-token-encryption-key-with-at-least-32-chars'
const secret = 'test-session-secret-with-at-least-32-chars'

type Claim = { id: string; workspace_id: string; external_id: string; resource: string | null; order_id: string | null; status: string | null; type: string | null; stage: string | null; reason_id: string | null; title: string | null; problem: string | null; due_date: string | null; external_created_at: string | null; external_updated_at: string | null; has_return: number }
type StoredMessage = { id: string; workspace_id: string; claim_id: string; external_claim_id: string; external_id: string; sender_role: string | null; receiver_role: string | null; message_text: string | null; message_date: string | null; external_created_at: string | null; raw_hash: string }
type Asset = { id: string; workspace_id: string; claim_id: string; external_claim_id: string; external_id: string; original_filename: string | null; mime_type: string | null; size_bytes: number | null; external_created_at: string | null; raw_hash: string }

class Statement implements D1Statement {
  constructor(private readonly db: EvidenceDb, private readonly query: string, private readonly values: unknown[] = []) {}
  bind(...values: unknown[]): D1Statement { return new Statement(this.db, this.query, values) }
  async first<T>(): Promise<T | null> { return this.db.first<T>(this.query, this.values) }
  async all<T>(): Promise<D1Result<T>> { return this.db.all<T>(this.query, this.values) }
  async run(): Promise<D1Result> { return this.db.run(this.query, this.values) }
}

class EvidenceDb implements D1Database {
  claims: Claim[] = []
  messages: StoredMessage[] = []
  assets: Asset[] = []
  links: Array<{ claim_id: string; asset_id: string }> = []
  orders: Array<Record<string, unknown>> = []
  items: Array<Record<string, unknown>> = []
  returns: Array<Record<string, unknown>> = []
  integration: Record<string, unknown> | null = null
  prepare(query: string): D1Statement { return new Statement(this, query) }
  async first<T>(query: string, values: unknown[]): Promise<T | null> {
    if (query.includes('FROM claims WHERE')) return (this.claims.find((claim) => claim.workspace_id === values[0] && claim.external_id === values[1]) as T | undefined) ?? null
    if (query.includes('FROM integrations WHERE')) return this.integration as T | null
    if (query.includes('FROM customer_messages WHERE')) return (this.messages.find((message) => message.workspace_id === values[0] && message.external_claim_id === values[1] && message.external_id === values[2]) as T | undefined) ?? null
    if (query.includes('FROM evidence_assets WHERE') && query.includes('channel')) return (this.assets.find((asset) => asset.workspace_id === values[0] && asset.external_claim_id === values[1] && asset.external_id === values[2]) as T | undefined) ?? null
    if (query.includes('FROM evidence_assets WHERE')) return (this.assets.find((asset) => asset.workspace_id === values[0] && asset.claim_id === values[1] && asset.external_id === values[2]) as T | undefined) ?? null
    if (query.includes('FROM orders WHERE')) return (this.orders.find((order) => order.id === values[0] && order.workspace_id === values[1]) as T | undefined) ?? null
    return null
  }
  async all<T>(query: string, values: unknown[]): Promise<D1Result<T>> {
    if (query.includes('FROM order_items')) return { results: this.items.filter((item) => item.workspace_id === values[0] && item.order_id === values[1]) as T[], success: true }
    if (query.includes('FROM returns')) return { results: this.returns.filter((returned) => returned.workspace_id === values[0] && returned.claim_id === values[1]) as T[], success: true }
    if (query.includes('FROM customer_messages')) return { results: this.messages.filter((message) => message.workspace_id === values[0] && message.claim_id === values[1]) as T[], success: true }
    if (query.includes('FROM claim_evidence')) return { results: this.links.filter((link) => link.claim_id === values[1]).map((link) => this.assets.find((asset) => asset.id === link.asset_id)!).filter(Boolean) as T[], success: true }
    return { results: [], success: true }
  }
  async run(query: string, values: unknown[]): Promise<D1Result> {
    if (query.startsWith('INSERT INTO customer_messages')) this.messages.push({ id: String(values[0]), workspace_id: String(values[1]), claim_id: String(values[2]), external_claim_id: String(values[3]), external_id: String(values[4]), sender_role: values[5] as string | null, receiver_role: values[6] as string | null, message_text: values[7] as string | null, message_date: values[8] as string | null, external_created_at: values[9] as string | null, raw_hash: String(values[12]) })
    if (query.startsWith('UPDATE customer_messages')) { const item = this.messages.find((message) => message.id === values[9])!; Object.assign(item, { message_text: values[2], raw_hash: values[7] }) }
    if (query.startsWith('INSERT INTO evidence_assets')) this.assets.push({ id: String(values[0]), workspace_id: String(values[1]), claim_id: String(values[2]), external_claim_id: String(values[3]), external_id: String(values[4]), original_filename: values[5] as string | null, mime_type: values[6] as string | null, size_bytes: values[7] as number | null, external_created_at: values[8] as string | null, raw_hash: String(values[9]) })
    if (query.startsWith('UPDATE evidence_assets')) { const item = this.assets.find((asset) => asset.id === values[6])!; Object.assign(item, { original_filename: values[0], raw_hash: values[4] }) }
    if (query.startsWith('INSERT OR IGNORE INTO claim_evidence') && !this.links.some((link) => link.claim_id === values[2] && link.asset_id === values[4])) this.links.push({ claim_id: String(values[2]), asset_id: String(values[4]) })
    return { results: [], success: true, meta: { changes: 1 } }
  }
}

async function dbWithClaim(workspace = 'workspace-a') {
  const db = new EvidenceDb()
  db.claims.push({ id: 'claim-local', workspace_id: workspace, external_id: 'claim-1', resource: 'order', order_id: 'order-local', status: 'opened', type: 'return', stage: 'dispute', reason_id: 'reason', title: 'Damaged item', problem: 'Damaged', due_date: '2026-12-01T12:00:00.000Z', external_created_at: '2026-09-01T12:00:00.000Z', external_updated_at: '2026-09-02T12:00:00.000Z', has_return: 1 })
  db.integration = { id: 'integration', workspace_id: workspace, status: 'CONNECTED', external_account_id: 'seller', access_token_encrypted: await encryptToken('backend-only-token', key), refresh_token_encrypted: await encryptToken('refresh', key), token_expires_at: '2999-01-01T00:00:00.000Z' }
  return db
}

function messageResponse() {
  return [
    { sender_role: 'respondent', receiver_role: 'complainant', message: 'Original evidence text', message_date: '2026-09-03T12:00:00.000Z', date_created: '2026-09-03T12:00:00.000Z', attachments: [{ filename: 'b.jpg', original_filename: 'b.jpg', type: 'image/jpeg', size: 20, date_created: '2026-09-03T12:00:00.000Z' }, { filename: 'a.jpg', original_filename: 'a.jpg', type: 'image/jpeg', size: 10, date_created: '2026-09-03T12:00:00.000Z' }, { size: 5 }] },
    { sender_role: 'complainant', receiver_role: 'respondent', message: 'No attachment', message_date: '2026-09-04T12:00:00.000Z', date_created: '2026-09-04T12:00:00.000Z', attachments: [] },
  ]
}

describe('Evidence Pack Foundation', () => {
  it('syncs messages and attachment metadata idempotently using only a GET', async () => {
    const db = await dbWithClaim()
    const methods: Array<string | undefined> = []
    const fetcher = ((_input: RequestInfo | URL, init?: RequestInit) => { methods.push(init?.method); return Promise.resolve(new Response(JSON.stringify(messageResponse()))) }) as typeof fetch
    const service = new EvidenceSyncService({ db, clientId: 'id', clientSecret: 'secret', tokenEncryptionKey: key, fetcher, now: () => new Date('2026-10-01T12:00:00.000Z') })
    await expect(service.sync('workspace-a', 'claim-1')).resolves.toEqual({ messages: 2, assets: 2, created: 4, updated: 0 })
    await expect(service.sync('workspace-a', 'claim-1')).resolves.toEqual({ messages: 2, assets: 2, created: 0, updated: 0 })
    expect(db.messages).toHaveLength(2); expect(db.assets).toHaveLength(2); expect(db.links).toHaveLength(2)
    expect(methods).toEqual([undefined, undefined])
  })

  it('builds a minimized pack with order, item product context, return, ordered timeline, and missing rules', async () => {
    const db = await dbWithClaim()
    db.orders.push({ id: 'order-local', workspace_id: 'workspace-a', external_id: 'order-1', status: 'paid', currency_id: 'BRL', total_amount: 100, paid_amount: 90, external_created_at: '2026-08-01T12:00:00.000Z' })
    db.items.push({ workspace_id: 'workspace-a', order_id: 'order-local', external_item_id: 'item-1', title: 'Item', seller_sku: 'SKU', quantity: 1, unit_price: 90, product_status: 'active', category_id: 'CAT' })
    db.returns.push({ workspace_id: 'workspace-a', claim_id: 'claim-local', external_id: 'return-1', status: 'opened', subtype: 'return', refund_at: null, date_closed: null, external_created_at: '2026-09-05T12:00:00.000Z' })
    db.messages.push({ id: 'message-local', workspace_id: 'workspace-a', claim_id: 'claim-local', external_claim_id: 'claim-1', external_id: 'message', sender_role: 'respondent', receiver_role: 'complainant', message_text: 'Evidence text', message_date: '2026-09-03T12:00:00.000Z', external_created_at: '2026-09-03T12:00:00.000Z', raw_hash: 'hash' })
    db.assets.push({ id: 'asset-local', workspace_id: 'workspace-a', claim_id: 'claim-local', external_claim_id: 'claim-1', external_id: 'asset.jpg', original_filename: 'asset.jpg', mime_type: 'image/jpeg', size_bytes: 10, external_created_at: 'invalid', raw_hash: 'hash' }); db.links.push({ claim_id: 'claim-local', asset_id: 'asset-local' })
    const pack = await getEvidencePack(db, 'workspace-a', 'claim-1')
    expect(pack.order?.externalOrderId).toBe('order-1'); expect(pack.items[0]).toMatchObject({ externalItemId: 'item-1', productStatus: 'active' }); expect(pack.returns).toHaveLength(1)
    expect(pack.timeline.map((event) => event.at)).toEqual([...pack.timeline.map((event) => event.at)].sort())
    expect(pack.missingEvidence).toEqual([])
    expect(JSON.stringify(pack)).not.toContain('backend-only-token')
  })

  it('applies every missing-evidence rule without requiring a deadline for a closed claim', async () => {
    const db = await dbWithClaim(); const claim = db.claims[0]
    Object.assign(claim, { order_id: null, due_date: null, status: 'opened', has_return: 1 })
    let pack = await getEvidencePack(db, 'workspace-a', 'claim-1')
    expect(pack.missingEvidence).toEqual(expect.arrayContaining(['ORDER_NOT_LINKED', 'DEADLINE_MISSING', 'NO_CLAIM_MESSAGES', 'NO_ATTACHMENT_EVIDENCE', 'RETURN_DATA_MISSING']))
    Object.assign(claim, { order_id: 'missing-order', status: 'closed' })
    pack = await getEvidencePack(db, 'workspace-a', 'claim-1')
    expect(pack.missingEvidence).not.toContain('DEADLINE_MISSING')
    db.orders.push({ id: 'missing-order', workspace_id: 'workspace-a', external_id: 'order-2', status: null, currency_id: 'BRL', total_amount: null, paid_amount: null, external_created_at: null })
    pack = await getEvidencePack(db, 'workspace-a', 'claim-1')
    expect(pack.missingEvidence).toEqual(expect.arrayContaining(['ORDER_AMOUNT_MISSING', 'ORDER_ITEMS_MISSING']))
  })

  it('blocks cross-workspace packs and attachments and proxies downloads without exposing a token', async () => {
    const db = await dbWithClaim('workspace-b'); db.assets.push({ id: 'asset-local', workspace_id: 'workspace-b', claim_id: 'claim-local', external_claim_id: 'claim-1', external_id: 'file.jpg', original_filename: 'bad\r\nname.jpg', mime_type: 'image/jpeg', size_bytes: 1, external_created_at: null, raw_hash: 'hash' })
    await expect(getEvidencePack(db, 'workspace-a', 'claim-1')).rejects.toMatchObject({ code: 'CLAIM_NOT_FOUND' } satisfies Partial<EvidenceError>)
    await expect(downloadEvidenceAsset({ db, clientId: 'id', clientSecret: 'secret', tokenEncryptionKey: key }, 'workspace-a', 'claim-1', 'file.jpg')).rejects.toMatchObject({ code: 'CLAIM_NOT_FOUND' } satisfies Partial<EvidenceError>)
    const ownDb = await dbWithClaim(); ownDb.assets.push({ id: 'asset-local', workspace_id: 'workspace-a', claim_id: 'claim-local', external_claim_id: 'claim-1', external_id: 'file.jpg', original_filename: 'bad\r\nname.jpg', mime_type: 'image/jpeg', size_bytes: 1, external_created_at: null, raw_hash: 'hash' })
    let downloadUrl = ''; let downloadInit: RequestInit | undefined
    const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => { downloadUrl = String(input); downloadInit = init; return Promise.resolve(new Response('bytes', { headers: { 'content-type': 'image/jpeg' } })) }) as typeof fetch
    const response = await downloadEvidenceAsset({ db: ownDb, clientId: 'id', clientSecret: 'secret', tokenEncryptionKey: key, fetcher }, 'workspace-a', 'claim-1', 'file.jpg')
    expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('content-disposition')).not.toMatch(/[\r\n]/); expect(await response.text()).toBe('bytes')
    expect(downloadUrl).not.toContain('backend-only-token')
    expect(downloadInit?.headers).toMatchObject({ authorization: 'Bearer backend-only-token' })
  })

  it('exposes packs only to the signed workspace session and never returns PII identifiers', async () => {
    const db = await dbWithClaim(); const token = await createSessionToken(createSession('user-a', 'workspace-a', 'OWNER'), secret)
    const env: Env = { DB: db, SESSION_SECRET: secret, MERCADOLIVRE_CLIENT_ID: 'id', MERCADOLIVRE_CLIENT_SECRET: 'secret', TOKEN_ENCRYPTION_KEY: key }
    expect((await handleRequest(new Request('https://selleros.xxx/api/returnshield/cases/claim-1/evidence-pack'), env)).status).toBe(403)
    const response = await handleRequest(new Request('https://selleros.xxx/api/returnshield/cases/claim-1/evidence-pack', { headers: { cookie: `selleros_session=${token}` } }), env)
    const body = JSON.stringify(await response.json())
    expect(response.status).toBe(200); expect(body).not.toContain('user-a'); expect(body).not.toContain('access_token'); expect(body).not.toContain('backend-only-token')
  })
})
