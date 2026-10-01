import { decryptToken, encryptToken } from './crypto'
import { refreshMercadoLivreTokens } from './mercadolivre'
import type { D1Database } from './types'

const MERCADOLIVRE_API_URL = 'https://api.mercadolibre.com'
const CHANNEL = 'MERCADOLIVRE'
const SYNC_TYPE = 'COMMERCE_SYNC'
const TOKEN_REFRESH_SKEW_MS = 60_000
const FIRST_ORDER_SYNC_DAYS = 90
const ORDER_SYNC_OVERLAP_MS = 5 * 60_000
const PRODUCT_PAGE_SIZE = 100
const BULK_ITEM_LIMIT = 20

type IntegrationRecord = {
  id: string
  workspace_id: string
  status: string
  external_account_id: string | null
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  token_expires_at: string | null
}

type ProductRecord = { id: string; raw_hash: string }
type OrderRecord = { id: string; raw_hash: string }
type LastJob = { finished_at: string | null }

type MercadoLivreProduct = {
  id?: string | number
  title?: string
  status?: string
  category_id?: string
  currency_id?: string
  price?: number
  seller_custom_field?: string | null
  date_created?: string
  last_updated?: string
}

type MercadoLivreBulkItem = { status_code?: number; body?: MercadoLivreProduct }

type MercadoLivreOrderItem = {
  item?: { id?: string | number; title?: string; seller_sku?: string | null; seller_custom_field?: string | null }
  quantity?: number
  unit_price?: number
  currency_id?: string
}

type MercadoLivreOrder = {
  id?: string | number
  status?: string
  currency_id?: string
  total_amount?: number
  paid_amount?: number
  date_created?: string
  date_closed?: string | null
  date_last_updated?: string
  order_items?: MercadoLivreOrderItem[]
}

type Page<T> = { results?: T[]; paging?: { total?: number; offset?: number; limit?: number }; scroll_id?: string | null }

export type SyncCounts = { seen: number; created: number; updated: number; failed: number }
export type SyncResponse = { jobId: string; status: 'SUCCESS' | 'PARTIAL' | 'FAILED'; products: number; orders: number; created: number; updated: number; failed: number; startedAt: string; finishedAt: string }

export class SyncError extends Error {
  constructor(readonly code: 'INTEGRATION_NOT_CONNECTED' | 'SYNC_IN_PROGRESS' | 'SYNC_CONFIGURATION_ERROR' | 'REMOTE_API_ERROR') {
    super(code)
  }
}

function emptyCounts(): SyncCounts { return { seen: 0, created: 0, updated: 0, failed: 0 } }

function changes(result: { meta?: Record<string, unknown> }): number | undefined {
  return typeof result.meta?.changes === 'number' ? result.meta.changes : undefined
}

function isTokenStillValid(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) return false
  const expiry = new Date(expiresAt).getTime()
  return Number.isFinite(expiry) && expiry > now.getTime() + TOKEN_REFRESH_SKEW_MS
}

async function hashNormalized(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

async function requestJson<T>(fetcher: typeof fetch, url: URL, accessToken: string): Promise<T> {
  const response = await fetcher(url.toString(), { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' } })
  if (!response.ok) throw new SyncError('REMOTE_API_ERROR')
  return response.json() as Promise<T>
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

export async function getValidMercadoLivreAccessToken(input: {
  db: D1Database
  integration: IntegrationRecord
  clientId?: string
  clientSecret?: string
  tokenEncryptionKey?: string
  now?: Date
  fetcher?: typeof fetch
}): Promise<string> {
  const { integration } = input
  if (integration.status !== 'CONNECTED' || !integration.access_token_encrypted || !integration.refresh_token_encrypted) throw new SyncError('INTEGRATION_NOT_CONNECTED')
  if (!input.clientId || !input.clientSecret || !input.tokenEncryptionKey) throw new SyncError('SYNC_CONFIGURATION_ERROR')
  const now = input.now ?? new Date()
  if (isTokenStillValid(integration.token_expires_at, now)) return decryptToken(integration.access_token_encrypted, input.tokenEncryptionKey)

  const refreshToken = await decryptToken(integration.refresh_token_encrypted, input.tokenEncryptionKey)
  const refreshed = await refreshMercadoLivreTokens({ clientId: input.clientId, clientSecret: input.clientSecret, refreshToken }, input.fetcher ?? fetch)
  const accessTokenEncrypted = await encryptToken(refreshed.access_token, input.tokenEncryptionKey)
  const refreshTokenEncrypted = await encryptToken(refreshed.refresh_token, input.tokenEncryptionKey)
  const expiresAt = new Date(now.getTime() + refreshed.expires_in * 1000).toISOString()
  const result = await input.db.prepare("UPDATE integrations SET access_token_encrypted = ?1, refresh_token_encrypted = ?2, token_expires_at = ?3, scopes = ?4, status = 'CONNECTED', updated_at = datetime('now') WHERE id = ?5")
    .bind(accessTokenEncrypted, refreshTokenEncrypted, expiresAt, refreshed.scope ?? null, integration.id)
    .run()
  if (changes(result) !== undefined && changes(result) !== 1) throw new SyncError('INTEGRATION_NOT_CONNECTED')
  integration.access_token_encrypted = accessTokenEncrypted
  integration.refresh_token_encrypted = refreshTokenEncrypted
  integration.token_expires_at = expiresAt
  return refreshed.access_token
}

export class MercadoLivreSyncService {
  constructor(private readonly input: {
    db: D1Database
    clientId?: string
    clientSecret?: string
    tokenEncryptionKey?: string
    fetcher?: typeof fetch
    now?: () => Date
  }) {}

  async sync(workspaceId: string): Promise<SyncResponse> {
    const integration = await this.input.db.prepare("SELECT id, workspace_id, status, external_account_id, access_token_encrypted, refresh_token_encrypted, token_expires_at FROM integrations WHERE workspace_id = ?1 AND channel = 'MERCADOLIVRE'")
      .bind(workspaceId)
      .first<IntegrationRecord>()
    if (!integration || integration.status !== 'CONNECTED' || !integration.external_account_id) throw new SyncError('INTEGRATION_NOT_CONNECTED')

    const now = this.input.now ?? (() => new Date())
    const startedAt = now().toISOString()
    const jobId = crypto.randomUUID()
    try {
      await this.input.db.prepare("INSERT INTO sync_jobs (id, workspace_id, integration_id, channel, type, status, started_at) VALUES (?1, ?2, ?3, 'MERCADOLIVRE', ?4, 'RUNNING', ?5)")
        .bind(jobId, workspaceId, integration.id, SYNC_TYPE, startedAt)
        .run()
    } catch {
      throw new SyncError('SYNC_IN_PROGRESS')
    }

    const products = emptyCounts()
    const orders = emptyCounts()
    const failures: string[] = []
    try {
      const accessToken = await getValidMercadoLivreAccessToken({ ...this.input, integration, now: now() })
      await this.syncProducts(workspaceId, integration.external_account_id, accessToken, products)
    } catch {
      failures.push('products')
      products.failed += 1
    }
    try {
      const accessToken = await getValidMercadoLivreAccessToken({ ...this.input, integration, now: now() })
      await this.syncOrders(workspaceId, integration.id, integration.external_account_id, accessToken, orders)
    } catch {
      failures.push('orders')
      orders.failed += 1
    }

    const usefulRecords = products.seen + orders.seen
    const status: SyncResponse['status'] = failures.length === 0 ? 'SUCCESS' : usefulRecords > 0 ? 'PARTIAL' : 'FAILED'
    const finishedAt = now().toISOString()
    const seen = products.seen + orders.seen
    const created = products.created + orders.created
    const updated = products.updated + orders.updated
    const failed = products.failed + orders.failed
    await this.input.db.prepare("UPDATE sync_jobs SET status = ?1, finished_at = ?2, records_seen = ?3, records_created = ?4, records_updated = ?5, records_failed = ?6, error_summary = ?7 WHERE id = ?8")
      .bind(status, finishedAt, seen, created, updated, failed, failures.length ? `${failures.join(', ')} sync failed` : null, jobId)
      .run()
    if (status !== 'FAILED') await this.input.db.prepare("UPDATE integrations SET last_sync_at = ?1, updated_at = datetime('now') WHERE id = ?2").bind(finishedAt, integration.id).run()
    return { jobId, status, products: products.seen, orders: orders.seen, created, updated, failed, startedAt, finishedAt }
  }

  private async syncProducts(workspaceId: string, sellerId: string, accessToken: string, counts: SyncCounts): Promise<void> {
    const productIds = await this.listProductIds(sellerId, accessToken)
    for (const group of chunks(productIds, BULK_ITEM_LIMIT)) {
      const url = new URL('/items/bulk', MERCADOLIVRE_API_URL)
      url.searchParams.set('ids', group.join(','))
      url.searchParams.set('attributes', 'body.id,body.title,body.status,body.category_id,body.currency_id,body.price,body.seller_custom_field,body.date_created,body.last_updated')
      const response = await requestJson<MercadoLivreBulkItem[]>(this.input.fetcher ?? fetch, url, accessToken)
      for (const entry of response) {
        if (entry.status_code !== 200 || !entry.body?.id || !entry.body.title) { counts.failed += 1; continue }
        counts.seen += 1
        await this.upsertProduct(workspaceId, entry.body, counts)
      }
    }
  }

  private async listProductIds(sellerId: string, accessToken: string): Promise<string[]> {
    const fetcher = this.input.fetcher ?? fetch
    const firstUrl = new URL(`/users/${encodeURIComponent(sellerId)}/items/search`, MERCADOLIVRE_API_URL)
    firstUrl.searchParams.set('limit', String(PRODUCT_PAGE_SIZE))
    firstUrl.searchParams.set('offset', '0')
    const first = await requestJson<Page<string>>(fetcher, firstUrl, accessToken)
    if ((first.paging?.total ?? 0) > 1000) {
      const ids: string[] = []
      let scrollId: string | null | undefined
      do {
        const scanUrl = new URL(`/users/${encodeURIComponent(sellerId)}/items/search`, MERCADOLIVRE_API_URL)
        scanUrl.searchParams.set('search_type', 'scan')
        scanUrl.searchParams.set('limit', String(PRODUCT_PAGE_SIZE))
        if (scrollId) scanUrl.searchParams.set('scroll_id', scrollId)
        const page = await requestJson<Page<string>>(fetcher, scanUrl, accessToken)
        ids.push(...(page.results ?? []).map(String))
        scrollId = page.scroll_id
      } while (scrollId)
      return ids
    }

    const ids = (first.results ?? []).map(String)
    const total = first.paging?.total ?? ids.length
    for (let offset = PRODUCT_PAGE_SIZE; offset < total; offset += PRODUCT_PAGE_SIZE) {
      const url = new URL(`/users/${encodeURIComponent(sellerId)}/items/search`, MERCADOLIVRE_API_URL)
      url.searchParams.set('limit', String(PRODUCT_PAGE_SIZE))
      url.searchParams.set('offset', String(offset))
      const page = await requestJson<Page<string>>(fetcher, url, accessToken)
      ids.push(...(page.results ?? []).map(String))
    }
    return ids
  }

  private async upsertProduct(workspaceId: string, product: MercadoLivreProduct, counts: SyncCounts): Promise<void> {
    const externalId = String(product.id)
    const normalized = { externalId, title: product.title, status: product.status ?? null, categoryId: product.category_id ?? null, currencyId: product.currency_id ?? null, price: safeNumber(product.price), sellerSku: product.seller_custom_field ?? null, createdAt: product.date_created ?? null, updatedAt: product.last_updated ?? null }
    const rawHash = await hashNormalized(normalized)
    const existing = await this.input.db.prepare("SELECT id, raw_hash FROM products WHERE workspace_id = ?1 AND channel = 'MERCADOLIVRE' AND external_id = ?2").bind(workspaceId, externalId).first<ProductRecord>()
    const syncedAt = (this.input.now ?? (() => new Date()))().toISOString()
    if (!existing) {
      await this.input.db.prepare("INSERT INTO products (id, workspace_id, channel, external_id, title, status, category_id, currency_id, price, seller_sku, external_created_at, external_updated_at, raw_hash, last_synced_at) VALUES (?1, ?2, 'MERCADOLIVRE', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)")
        .bind(crypto.randomUUID(), workspaceId, externalId, normalized.title, normalized.status, normalized.categoryId, normalized.currencyId, normalized.price, normalized.sellerSku, normalized.createdAt, normalized.updatedAt, rawHash, syncedAt)
        .run()
      counts.created += 1
    } else if (existing.raw_hash !== rawHash) {
      await this.input.db.prepare("UPDATE products SET title = ?1, status = ?2, category_id = ?3, currency_id = ?4, price = ?5, seller_sku = ?6, external_created_at = ?7, external_updated_at = ?8, raw_hash = ?9, last_synced_at = ?10, updated_at = datetime('now') WHERE id = ?11")
        .bind(normalized.title, normalized.status, normalized.categoryId, normalized.currencyId, normalized.price, normalized.sellerSku, normalized.createdAt, normalized.updatedAt, rawHash, syncedAt, existing.id)
        .run()
      counts.updated += 1
    }
  }

  private async syncOrders(workspaceId: string, integrationId: string, sellerId: string, accessToken: string, counts: SyncCounts): Promise<void> {
    const last = await this.input.db.prepare("SELECT finished_at FROM sync_jobs WHERE workspace_id = ?1 AND integration_id = ?2 AND type = ?3 AND status = 'SUCCESS' ORDER BY finished_at DESC LIMIT 1")
      .bind(workspaceId, integrationId, SYNC_TYPE)
      .first<LastJob>()
    const now = (this.input.now ?? (() => new Date()))()
    const from = last?.finished_at ? new Date(new Date(last.finished_at).getTime() - ORDER_SYNC_OVERLAP_MS) : new Date(now.getTime() - FIRST_ORDER_SYNC_DAYS * 24 * 60 * 60 * 1000)
    const fetcher = this.input.fetcher ?? fetch
    let offset = 0
    let total = Infinity
    while (offset < total) {
      const url = new URL('/orders/search', MERCADOLIVRE_API_URL)
      url.searchParams.set('seller', sellerId)
      url.searchParams.set('order.date_last_updated.from', from.toISOString())
      url.searchParams.set('order.date_last_updated.to', now.toISOString())
      url.searchParams.set('limit', '50')
      url.searchParams.set('offset', String(offset))
      const page = await requestJson<Page<MercadoLivreOrder>>(fetcher, url, accessToken)
      const results = page.results ?? []
      for (const order of results) {
        if (order.id === undefined || order.id === null) { counts.failed += 1; continue }
        counts.seen += 1
        await this.upsertOrder(workspaceId, order, counts)
      }
      total = page.paging?.total ?? results.length
      offset += page.paging?.limit ?? 50
      if (results.length === 0) break
    }
  }

  private async upsertOrder(workspaceId: string, order: MercadoLivreOrder, counts: SyncCounts): Promise<void> {
    const externalId = String(order.id)
    const items = (order.order_items ?? []).map((item) => ({ externalItemId: item.item?.id === undefined ? null : String(item.item.id), title: item.item?.title ?? null, sellerSku: item.item?.seller_sku ?? item.item?.seller_custom_field ?? null, quantity: typeof item.quantity === 'number' && Number.isInteger(item.quantity) ? item.quantity : null, unitPrice: safeNumber(item.unit_price), currencyId: item.currency_id ?? order.currency_id ?? null }))
    const normalized = { externalId, status: order.status ?? null, currencyId: order.currency_id ?? null, totalAmount: safeNumber(order.total_amount), paidAmount: safeNumber(order.paid_amount), createdAt: order.date_created ?? null, closedAt: order.date_closed ?? null, updatedAt: order.date_last_updated ?? null, items }
    const rawHash = await hashNormalized(normalized)
    const existing = await this.input.db.prepare("SELECT id, raw_hash FROM orders WHERE workspace_id = ?1 AND channel = 'MERCADOLIVRE' AND external_id = ?2").bind(workspaceId, externalId).first<OrderRecord>()
    const syncedAt = (this.input.now ?? (() => new Date()))().toISOString()
    let orderId = existing?.id
    if (!existing) {
      orderId = crypto.randomUUID()
      await this.input.db.prepare("INSERT INTO orders (id, workspace_id, channel, external_id, status, currency_id, total_amount, paid_amount, external_created_at, external_closed_at, external_updated_at, raw_hash, last_synced_at) VALUES (?1, ?2, 'MERCADOLIVRE', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)")
        .bind(orderId, workspaceId, externalId, normalized.status, normalized.currencyId, normalized.totalAmount, normalized.paidAmount, normalized.createdAt, normalized.closedAt, normalized.updatedAt, rawHash, syncedAt)
        .run()
      counts.created += 1
    } else if (existing.raw_hash !== rawHash) {
      await this.input.db.prepare("UPDATE orders SET status = ?1, currency_id = ?2, total_amount = ?3, paid_amount = ?4, external_created_at = ?5, external_closed_at = ?6, external_updated_at = ?7, raw_hash = ?8, last_synced_at = ?9, updated_at = datetime('now') WHERE id = ?10")
        .bind(normalized.status, normalized.currencyId, normalized.totalAmount, normalized.paidAmount, normalized.createdAt, normalized.closedAt, normalized.updatedAt, rawHash, syncedAt, existing.id)
        .run()
      counts.updated += 1
    }
    if (!existing || existing.raw_hash !== rawHash) await this.upsertOrderItems(workspaceId, orderId!, items)
  }

  private async upsertOrderItems(workspaceId: string, orderId: string, items: Array<{ externalItemId: string | null; title: string | null; sellerSku: string | null; quantity: number | null; unitPrice: number | null; currencyId: string | null }>): Promise<void> {
    for (const item of items) {
      if (!item.externalItemId || item.quantity === null) continue
      await this.input.db.prepare("INSERT INTO order_items (id, workspace_id, order_id, external_item_id, title, seller_sku, quantity, unit_price, currency_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(workspace_id, order_id, external_item_id) DO UPDATE SET title = excluded.title, seller_sku = excluded.seller_sku, quantity = excluded.quantity, unit_price = excluded.unit_price, currency_id = excluded.currency_id, updated_at = datetime('now')")
        .bind(crypto.randomUUID(), workspaceId, orderId, item.externalItemId, item.title, item.sellerSku, item.quantity, item.unitPrice, item.currencyId)
        .run()
    }
  }
}
