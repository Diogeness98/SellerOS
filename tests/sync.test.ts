import { describe, expect, it, vi } from 'vitest'
import { decryptToken, encryptToken } from '../worker/crypto'
import { MercadoLivreSyncService, SyncError } from '../worker/sync'
import { handleRequest } from '../worker/api'
import { createSession, createSessionToken } from '../shared/auth'
import type { D1Database, D1Result, D1Statement, Env } from '../worker/types'

type Integration = { id: string; workspace_id: string; status: string; external_account_id: string | null; access_token_encrypted: string | null; refresh_token_encrypted: string | null; token_expires_at: string | null; last_sync_at: string | null }
type Product = { id: string; workspace_id: string; external_id: string; raw_hash: string; price: number | null }
type Order = { id: string; workspace_id: string; external_id: string; raw_hash: string; status: string | null }
type OrderItem = { workspace_id: string; order_id: string; external_item_id: string; quantity: number }
type Job = { id: string; workspace_id: string; integration_id: string; status: string; type: string; finished_at: string | null; records_seen: number; records_created: number; records_updated: number; records_failed: number }

class FakeStatement implements D1Statement {
  constructor(private readonly db: FakeSyncDb, private readonly query: string, private readonly values: unknown[] = []) {}
  bind(...values: unknown[]): D1Statement { return new FakeStatement(this.db, this.query, values) }
  async first<T>(): Promise<T | null> { return this.db.first<T>(this.query, this.values) }
  async all<T>(): Promise<D1Result<T>> { return { results: [] as T[], success: true } }
  async run(): Promise<D1Result> { return this.db.run(this.query, this.values) }
}

class FakeSyncDb implements D1Database {
  integrations: Integration[] = []
  products: Product[] = []
  orders: Order[] = []
  orderItems: OrderItem[] = []
  jobs: Job[] = []

  prepare(query: string): D1Statement { return new FakeStatement(this, query) }

  async first<T>(query: string, values: unknown[]): Promise<T | null> {
    if (query.includes('FROM integrations WHERE workspace_id')) return (this.integrations.find((value) => value.workspace_id === values[0]) as T | undefined) ?? null
    if (query.includes('FROM products WHERE')) return (this.products.find((value) => value.workspace_id === values[0] && value.external_id === values[1]) as T | undefined) ?? null
    if (query.includes('FROM orders WHERE')) return (this.orders.find((value) => value.workspace_id === values[0] && value.external_id === values[1]) as T | undefined) ?? null
    if (query.includes('FROM sync_jobs WHERE')) {
      const result = this.jobs.filter((value) => value.workspace_id === values[0] && value.integration_id === values[1] && value.type === values[2] && value.status === 'SUCCESS').at(-1)
      return (result as T | undefined) ?? null
    }
    return null
  }

  async run(query: string, values: unknown[]): Promise<D1Result> {
    if (query.startsWith('INSERT INTO sync_jobs')) {
      if (this.jobs.some((job) => job.workspace_id === values[1] && job.integration_id === values[2] && job.status === 'RUNNING')) throw new Error('unique running job')
      this.jobs.push({ id: String(values[0]), workspace_id: String(values[1]), integration_id: String(values[2]), type: String(values[3]), status: 'RUNNING', finished_at: null, records_seen: 0, records_created: 0, records_updated: 0, records_failed: 0 })
      return { results: [], success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('UPDATE sync_jobs SET status')) {
      const job = this.jobs.find((value) => value.id === values[7])!
      Object.assign(job, { status: values[0], finished_at: values[1], records_seen: values[2], records_created: values[3], records_updated: values[4], records_failed: values[5] })
      return { results: [], success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('UPDATE integrations SET access_token_encrypted')) {
      const integration = this.integrations.find((value) => value.id === values[4])!
      Object.assign(integration, { access_token_encrypted: values[0], refresh_token_encrypted: values[1], token_expires_at: values[2] })
      return { results: [], success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('UPDATE integrations SET last_sync_at')) {
      const integration = this.integrations.find((value) => value.id === values[1])!
      integration.last_sync_at = String(values[0])
      return { results: [], success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('INSERT INTO products')) {
      this.products.push({ id: String(values[0]), workspace_id: String(values[1]), external_id: String(values[2]), price: values[7] as number | null, raw_hash: String(values[11]) })
      return { results: [], success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('UPDATE products SET')) {
      const product = this.products.find((value) => value.id === values[10])!
      Object.assign(product, { price: values[4] as number | null, raw_hash: String(values[8]) })
      return { results: [], success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('INSERT INTO orders')) {
      this.orders.push({ id: String(values[0]), workspace_id: String(values[1]), external_id: String(values[2]), status: values[3] as string | null, raw_hash: String(values[10]) })
      return { results: [], success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('UPDATE orders SET')) {
      const order = this.orders.find((value) => value.id === values[9])!
      Object.assign(order, { status: values[0] as string | null, raw_hash: String(values[7]) })
      return { results: [], success: true, meta: { changes: 1 } }
    }
    if (query.startsWith('INSERT INTO order_items')) {
      const existing = this.orderItems.find((value) => value.workspace_id === values[1] && value.order_id === values[2] && value.external_item_id === values[3])
      if (existing) existing.quantity = Number(values[6])
      else this.orderItems.push({ workspace_id: String(values[1]), order_id: String(values[2]), external_item_id: String(values[3]), quantity: Number(values[6]) })
      return { results: [], success: true, meta: { changes: 1 } }
    }
    return { results: [], success: true, meta: { changes: 1 } }
  }
}

const tokenKey = 'test-token-encryption-key-with-at-least-32-chars'
const fixedNow = new Date('2026-09-30T12:00:00.000Z')

async function connectedIntegration(overrides: Partial<Integration> = {}): Promise<Integration> {
  return {
    id: 'integration-a', workspace_id: 'workspace-a', status: 'CONNECTED', external_account_id: 'seller-123',
    access_token_encrypted: await encryptToken('valid-access-token', tokenKey), refresh_token_encrypted: await encryptToken('valid-refresh-token', tokenKey),
    token_expires_at: '2026-09-30T18:00:00.000Z', last_sync_at: null, ...overrides,
  }
}

function product(id = 'MLB1', price = 10) { return { id, title: `Product ${id}`, status: 'active', category_id: 'MLB1', currency_id: 'BRL', price, seller_custom_field: 'SKU-1', date_created: '2026-01-01T00:00:00.000Z', last_updated: '2026-09-01T00:00:00.000Z' } }
function order(id = '123', status = 'paid') { return { id, status, currency_id: 'BRL', total_amount: 10, paid_amount: 10, date_created: '2026-09-01T00:00:00.000Z', date_last_updated: '2026-09-02T00:00:00.000Z', order_items: [{ item: { id: 'MLB1', title: 'Product MLB1', seller_sku: 'SKU-1' }, quantity: 1, unit_price: 10, currency_id: 'BRL' }] } }

function mercadoLivreFetch(products: ReturnType<typeof product>[], orders: ReturnType<typeof order>[], options: { failProducts?: boolean; refresh?: boolean } = {}) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input)
    if (url.endsWith('/oauth/token')) return new Response(JSON.stringify({ access_token: 'new-access-token', refresh_token: 'new-refresh-token', expires_in: 21600 }), { status: 200 })
    if (url.includes('/items/search')) {
      if (options.failProducts) return new Response('{}', { status: 500 })
      return new Response(JSON.stringify({ results: products.map((value) => value.id), paging: { total: products.length, limit: 100, offset: 0 } }), { status: 200 })
    }
    if (url.includes('/items/bulk')) return new Response(JSON.stringify(products.map((value) => ({ status_code: 200, body: value }))), { status: 200 })
    if (url.includes('/orders/search')) return new Response(JSON.stringify({ results: orders, paging: { total: orders.length, limit: 50, offset: 0 } }), { status: 200 })
    throw new Error(`Unexpected URL: ${url}`)
  }) as unknown as typeof fetch
}

function service(db: FakeSyncDb, fetcher: typeof fetch) {
  return new MercadoLivreSyncService({ db, clientId: 'client-id', clientSecret: 'client-secret', tokenEncryptionKey: tokenKey, fetcher, now: () => fixedNow })
}

describe('Mercado Livre commerce sync foundation', () => {
  it('creates products and orders on the first sync', async () => {
    const db = new FakeSyncDb(); db.integrations.push(await connectedIntegration())
    const result = await service(db, mercadoLivreFetch([product()], [order()])).sync('workspace-a')
    expect(result).toMatchObject({ status: 'SUCCESS', products: 1, orders: 1, created: 2, failed: 0 })
    expect(db.products).toHaveLength(1); expect(db.orders).toHaveLength(1); expect(db.orderItems).toHaveLength(1)
  })

  it('repeats product and order syncs without duplication', async () => {
    const db = new FakeSyncDb(); db.integrations.push(await connectedIntegration())
    const fetcher = mercadoLivreFetch([product()], [order()])
    await service(db, fetcher).sync('workspace-a')
    const repeated = await service(db, fetcher).sync('workspace-a')
    expect(repeated).toMatchObject({ created: 0, updated: 0 })
    expect(db.products).toHaveLength(1); expect(db.orders).toHaveLength(1); expect(db.orderItems).toHaveLength(1)
  })

  it('updates a product only when its raw hash changes', async () => {
    const db = new FakeSyncDb(); db.integrations.push(await connectedIntegration())
    await service(db, mercadoLivreFetch([product('MLB1', 10)], [])).sync('workspace-a')
    const result = await service(db, mercadoLivreFetch([product('MLB1', 25)], [])).sync('workspace-a')
    expect(result.updated).toBe(1); expect(db.products[0].price).toBe(25)
  })

  it('updates an existing order and its item without duplication', async () => {
    const db = new FakeSyncDb(); db.integrations.push(await connectedIntegration())
    await service(db, mercadoLivreFetch([], [order('123', 'paid')])).sync('workspace-a')
    const result = await service(db, mercadoLivreFetch([], [order('123', 'cancelled')])).sync('workspace-a')
    expect(result.updated).toBe(1); expect(db.orders).toHaveLength(1); expect(db.orders[0].status).toBe('cancelled'); expect(db.orderItems).toHaveLength(1)
  })

  it('does not duplicate a repeated external product ID', async () => {
    const db = new FakeSyncDb(); db.integrations.push(await connectedIntegration())
    await service(db, mercadoLivreFetch([product('MLB1'), product('MLB1')], [])).sync('workspace-a')
    expect(db.products).toHaveLength(1)
  })

  it('keeps sync data isolated to its workspace', async () => {
    const db = new FakeSyncDb(); db.integrations.push(await connectedIntegration())
    await service(db, mercadoLivreFetch([product()], [order()])).sync('workspace-a')
    await expect(service(db, mercadoLivreFetch([], [])).sync('workspace-b')).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONNECTED' })
    expect(db.products.every((value) => value.workspace_id === 'workspace-a')).toBe(true)
  })

  it('rejects a disconnected integration', async () => {
    const db = new FakeSyncDb(); db.integrations.push(await connectedIntegration({ status: 'DISCONNECTED' }))
    await expect(service(db, mercadoLivreFetch([], [])).sync('workspace-a')).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONNECTED' })
  })

  it('uses a still-valid access token without refresh', async () => {
    const db = new FakeSyncDb(); db.integrations.push(await connectedIntegration())
    const fetcher = mercadoLivreFetch([product()], [])
    await service(db, fetcher).sync('workspace-a')
    expect((fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls.some((call: unknown[]) => String(call[0]).endsWith('/oauth/token'))).toBe(false)
  })

  it('refreshes an expired token and replaces the one-time refresh token', async () => {
    const db = new FakeSyncDb(); db.integrations.push(await connectedIntegration({ token_expires_at: '2026-09-30T11:00:00.000Z' }))
    const fetcher = mercadoLivreFetch([product()], [])
    await service(db, fetcher).sync('workspace-a')
    expect(await decryptToken(db.integrations[0].access_token_encrypted!, tokenKey)).toBe('new-access-token')
    expect(await decryptToken(db.integrations[0].refresh_token_encrypted!, tokenKey)).toBe('new-refresh-token')
    expect((fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((call: unknown[]) => String(call[0]).endsWith('/oauth/token'))).toHaveLength(1)
  })

  it('marks a job partial when product sync fails after orders succeed', async () => {
    const db = new FakeSyncDb(); db.integrations.push(await connectedIntegration())
    const result = await service(db, mercadoLivreFetch([], [order()], { failProducts: true })).sync('workspace-a')
    expect(result).toMatchObject({ status: 'PARTIAL', orders: 1 }); expect(result.failed).toBeGreaterThan(0)
  })

  it('blocks a second concurrent sync for the same integration', async () => {
    const db = new FakeSyncDb(); db.integrations.push(await connectedIntegration()); db.jobs.push({ id: 'running', workspace_id: 'workspace-a', integration_id: 'integration-a', type: 'COMMERCE_SYNC', status: 'RUNNING', finished_at: null, records_seen: 0, records_created: 0, records_updated: 0, records_failed: 0 })
    await expect(service(db, mercadoLivreFetch([], [])).sync('workspace-a')).rejects.toMatchObject({ code: 'SYNC_IN_PROGRESS' } satisfies Partial<SyncError>)
  })

  it('never returns access or refresh tokens in a sync response', async () => {
    const db = new FakeSyncDb(); db.integrations.push(await connectedIntegration())
    const result = await service(db, mercadoLivreFetch([product()], [order()])).sync('workspace-a')
    const response = JSON.stringify(result)
    expect(response).not.toContain('valid-access-token'); expect(response).not.toContain('valid-refresh-token')
  })

  it('requires a session and returns only safe sync data from the API route', async () => {
    const db = new FakeSyncDb(); db.integrations.push(await connectedIntegration())
    vi.stubGlobal('fetch', mercadoLivreFetch([product()], [order()]))
    const env: Env = { DB: db, SESSION_SECRET: 'test-session-secret-with-at-least-32-chars', MERCADOLIVRE_CLIENT_ID: 'client-id', MERCADOLIVRE_CLIENT_SECRET: 'client-secret', TOKEN_ENCRYPTION_KEY: tokenKey }
    const unauthenticated = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/sync', { method: 'POST' }), env)
    expect(unauthenticated.status).toBe(403)
    const operatorSession = await createSessionToken(createSession('user-2', 'workspace-a', 'OPERATOR'), env.SESSION_SECRET)
    const operator = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/sync', { method: 'POST', headers: { cookie: `selleros_session=${operatorSession}` } }), env)
    expect(operator.status).toBe(403)
    const session = await createSessionToken(createSession('user-1', 'workspace-a', 'OWNER'), env.SESSION_SECRET)
    const response = await handleRequest(new Request('https://selleros.xxx/api/integrations/mercadolivre/sync', { method: 'POST', headers: { cookie: `selleros_session=${session}` } }), { ...env, DB: db })
    const body = JSON.stringify(await response.json())
    expect(response.status).toBe(200); expect(body).not.toContain('access_token'); expect(body).not.toContain('refresh_token'); expect(body).not.toContain('valid-access-token')
    vi.unstubAllGlobals()
  })
})
