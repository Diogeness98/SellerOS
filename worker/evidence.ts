import { getValidMercadoLivreAccessToken, SyncError } from './sync'
import type { D1Database } from './types'

const API_URL = 'https://api.mercadolibre.com'

type Integration = { id: string; workspace_id: string; status: string; external_account_id: string | null; access_token_encrypted: string | null; refresh_token_encrypted: string | null; token_expires_at: string | null }
type Claim = { id: string; external_id: string; resource: string | null; order_id: string | null; status: string | null; type: string | null; stage: string | null; reason_id: string | null; title: string | null; problem: string | null; due_date: string | null; external_created_at: string | null; external_updated_at: string | null; has_return: number }
type Message = { sender_role?: unknown; receiver_role?: unknown; message?: unknown; message_date?: unknown; date_created?: unknown; last_updated?: unknown; date_read?: unknown; attachments?: unknown }
type Attachment = { filename?: unknown; file_name?: unknown; original_filename?: unknown; type?: unknown; size?: unknown; date_created?: unknown }

export type EvidenceSyncResult = { messages: number; assets: number; created: number; updated: number }
export type EvidencePack = {
  externalClaimId: string
  claim: { status: string | null; type: string | null; stage: string | null; reasonId: string | null; title: string | null; problem: string | null; dueDate: string | null; createdAt: string | null; updatedAt: string | null }
  order: { externalOrderId: string; status: string | null; currencyId: string | null; totalAmount: number | null; paidAmount: number | null; createdAt: string | null } | null
  items: Array<{ externalItemId: string; title: string | null; sellerSku: string | null; quantity: number; unitPrice: number | null; productStatus: string | null; categoryId: string | null }>
  returns: Array<{ externalReturnId: string; status: string | null; subtype: string | null; refundAt: string | null; closedAt: string | null }>
  messages: Array<{ senderRole: string | null; receiverRole: string | null; messageText: string | null; messageDate: string | null }>
  assets: Array<{ externalId: string; originalFilename: string | null; mimeType: string | null; sizeBytes: number | null; createdAt: string | null }>
  timeline: Array<{ type: string; at: string; source: string; summary: string }>
  missingEvidence: string[]
}

export class EvidenceError extends Error {
  constructor(readonly code: 'CLAIM_NOT_FOUND' | 'ASSET_NOT_FOUND' | 'INTEGRATION_NOT_CONNECTED' | 'CONFIGURATION_ERROR' | 'REMOTE_API_ERROR') { super(code) }
}

function text(value: unknown): string | null { return typeof value === 'string' && value.length > 0 ? value : null }
function number(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null }
function attachments(value: unknown): Attachment[] { return Array.isArray(value) ? value.filter((item): item is Attachment => typeof item === 'object' && item !== null) : [] }

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function getClaim(db: D1Database, workspaceId: string, externalClaimId: string): Promise<Claim> {
  const claim = await db.prepare("SELECT id, external_id, resource, order_id, status, type, stage, reason_id, title, problem, due_date, external_created_at, external_updated_at, has_return FROM claims WHERE workspace_id = ?1 AND channel = 'MERCADOLIVRE' AND external_id = ?2")
    .bind(workspaceId, externalClaimId).first<Claim>()
  if (!claim) throw new EvidenceError('CLAIM_NOT_FOUND')
  return claim
}

async function accessToken(db: D1Database, workspaceId: string, input: EvidenceInput): Promise<string> {
  const integration = await db.prepare("SELECT id, workspace_id, status, external_account_id, access_token_encrypted, refresh_token_encrypted, token_expires_at FROM integrations WHERE workspace_id = ?1 AND channel = 'MERCADOLIVRE'").bind(workspaceId).first<Integration>()
  if (!integration) throw new EvidenceError('INTEGRATION_NOT_CONNECTED')
  try {
    return await getValidMercadoLivreAccessToken({ db, integration, clientId: input.clientId, clientSecret: input.clientSecret, tokenEncryptionKey: input.tokenEncryptionKey, fetcher: input.fetcher })
  } catch (cause) {
    if (cause instanceof SyncError && cause.code === 'INTEGRATION_NOT_CONNECTED') throw new EvidenceError('INTEGRATION_NOT_CONNECTED')
    if (cause instanceof SyncError && cause.code === 'SYNC_CONFIGURATION_ERROR') throw new EvidenceError('CONFIGURATION_ERROR')
    throw cause
  }
}

async function readMessages(fetcher: typeof fetch, externalClaimId: string, token: string): Promise<Message[]> {
  const response = await fetcher(new URL(`/post-purchase/v1/claims/${encodeURIComponent(externalClaimId)}/messages`, API_URL).toString(), { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } })
  if (!response.ok) throw new EvidenceError('REMOTE_API_ERROR')
  const body = await response.json() as unknown
  return Array.isArray(body) ? body.filter((item): item is Message => typeof item === 'object' && item !== null) : []
}

export type EvidenceInput = { db: D1Database; clientId?: string; clientSecret?: string; tokenEncryptionKey?: string; fetcher?: typeof fetch; now?: () => Date }

export class EvidenceSyncService {
  constructor(private readonly input: EvidenceInput) {}

  async sync(workspaceId: string, externalClaimId: string): Promise<EvidenceSyncResult> {
    const claim = await getClaim(this.input.db, workspaceId, externalClaimId)
    const token = await accessToken(this.input.db, workspaceId, this.input)
    const messages = await readMessages(this.input.fetcher ?? fetch, externalClaimId, token)
    const result: EvidenceSyncResult = { messages: 0, assets: 0, created: 0, updated: 0 }
    const syncedAt = (this.input.now ?? (() => new Date()))().toISOString()
    for (const remote of messages) {
      const remoteAttachments = attachments(remote.attachments).map((attachment) => ({ attachment, externalId: text(attachment.filename) ?? text(attachment.file_name) })).filter((item): item is { attachment: Attachment; externalId: string } => item.externalId !== null).sort((left, right) => left.externalId.localeCompare(right.externalId))
      const normalized = { externalClaimId, senderRole: text(remote.sender_role), receiverRole: text(remote.receiver_role), messageDate: text(remote.message_date), createdAt: text(remote.date_created), text: text(remote.message), attachments: remoteAttachments.map((item) => item.externalId) }
      const externalId = await digest(normalized)
      const rawHash = await digest(normalized)
      const existing = await this.input.db.prepare("SELECT id, raw_hash FROM customer_messages WHERE workspace_id = ?1 AND channel = 'MERCADOLIVRE' AND external_claim_id = ?2 AND external_id = ?3").bind(workspaceId, externalClaimId, externalId).first<{ id: string; raw_hash: string }>()
      let messageId = existing?.id
      if (!existing) {
        messageId = crypto.randomUUID()
        await this.input.db.prepare("INSERT INTO customer_messages (id, workspace_id, channel, claim_id, external_claim_id, external_id, sender_role, receiver_role, message_text, message_date, external_created_at, external_updated_at, date_read, raw_hash, last_synced_at) VALUES (?1, ?2, 'MERCADOLIVRE', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)")
          .bind(messageId, workspaceId, claim.id, externalClaimId, externalId, normalized.senderRole, normalized.receiverRole, normalized.text, normalized.messageDate, normalized.createdAt, text(remote.last_updated), text(remote.date_read), rawHash, syncedAt).run()
        result.created += 1
      } else if (existing.raw_hash !== rawHash) {
        await this.input.db.prepare("UPDATE customer_messages SET sender_role = ?1, receiver_role = ?2, message_text = ?3, message_date = ?4, external_created_at = ?5, external_updated_at = ?6, date_read = ?7, raw_hash = ?8, last_synced_at = ?9, updated_at = datetime('now') WHERE id = ?10")
          .bind(normalized.senderRole, normalized.receiverRole, normalized.text, normalized.messageDate, normalized.createdAt, text(remote.last_updated), text(remote.date_read), rawHash, syncedAt, existing.id).run()
        result.updated += 1
      }
      result.messages += 1
      for (const item of remoteAttachments) {
        const assetNormalized = { externalId: item.externalId, originalFilename: text(item.attachment.original_filename), mimeType: text(item.attachment.type), size: number(item.attachment.size), createdAt: text(item.attachment.date_created) }
        const assetHash = await digest(assetNormalized)
        const existingAsset = await this.input.db.prepare("SELECT id, raw_hash FROM evidence_assets WHERE workspace_id = ?1 AND channel = 'MERCADOLIVRE' AND external_claim_id = ?2 AND external_id = ?3").bind(workspaceId, externalClaimId, item.externalId).first<{ id: string; raw_hash: string }>()
        let assetId = existingAsset?.id
        if (!existingAsset) {
          assetId = crypto.randomUUID()
          await this.input.db.prepare("INSERT INTO evidence_assets (id, workspace_id, channel, claim_id, external_claim_id, source_type, external_id, original_filename, mime_type, size_bytes, external_created_at, raw_hash, last_synced_at) VALUES (?1, ?2, 'MERCADOLIVRE', ?3, ?4, 'CLAIM_MESSAGE_ATTACHMENT', ?5, ?6, ?7, ?8, ?9, ?10, ?11)")
            .bind(assetId, workspaceId, claim.id, externalClaimId, item.externalId, assetNormalized.originalFilename, assetNormalized.mimeType, assetNormalized.size, assetNormalized.createdAt, assetHash, syncedAt).run()
          result.created += 1
        } else if (existingAsset.raw_hash !== assetHash) {
          await this.input.db.prepare("UPDATE evidence_assets SET original_filename = ?1, mime_type = ?2, size_bytes = ?3, external_created_at = ?4, raw_hash = ?5, last_synced_at = ?6, updated_at = datetime('now') WHERE id = ?7")
            .bind(assetNormalized.originalFilename, assetNormalized.mimeType, assetNormalized.size, assetNormalized.createdAt, assetHash, syncedAt, existingAsset.id).run()
          result.updated += 1
        }
        await this.input.db.prepare("INSERT OR IGNORE INTO claim_evidence (id, workspace_id, claim_id, message_id, evidence_asset_id, evidence_type) VALUES (?1, ?2, ?3, ?4, ?5, 'CLAIM_MESSAGE_ATTACHMENT')")
          .bind(crypto.randomUUID(), workspaceId, claim.id, messageId, assetId).run()
        result.assets += 1
      }
    }
    return result
  }
}

function validDate(value: string | null): value is string { return value !== null && Number.isFinite(new Date(value).getTime()) }
function event(events: EvidencePack['timeline'], type: string, at: string | null, source: string, summary: string) { if (validDate(at)) events.push({ type, at, source, summary }) }

export async function getEvidencePack(db: D1Database, workspaceId: string, externalClaimId: string): Promise<EvidencePack> {
  const claim = await getClaim(db, workspaceId, externalClaimId)
  type Order = { external_id: string; status: string | null; currency_id: string | null; total_amount: number | null; paid_amount: number | null; external_created_at: string | null }
  type Item = { external_item_id: string; title: string | null; seller_sku: string | null; quantity: number; unit_price: number | null; product_status: string | null; category_id: string | null }
  type Return = { external_id: string; status: string | null; subtype: string | null; refund_at: string | null; date_closed: string | null; external_created_at: string | null }
  type StoredMessage = { sender_role: string | null; receiver_role: string | null; message_text: string | null; message_date: string | null; external_created_at: string | null }
  type Asset = { external_id: string; original_filename: string | null; mime_type: string | null; size_bytes: number | null; external_created_at: string | null }
  const order = claim.order_id ? await db.prepare('SELECT external_id, status, currency_id, total_amount, paid_amount, external_created_at FROM orders WHERE id = ?1 AND workspace_id = ?2').bind(claim.order_id, workspaceId).first<Order>() : null
  const [items, returns, messages, assets] = await Promise.all([
    claim.order_id ? db.prepare('SELECT oi.external_item_id, oi.title, oi.seller_sku, oi.quantity, oi.unit_price, p.status AS product_status, p.category_id FROM order_items oi LEFT JOIN products p ON p.workspace_id = oi.workspace_id AND p.external_id = oi.external_item_id WHERE oi.workspace_id = ?1 AND oi.order_id = ?2').bind(workspaceId, claim.order_id).all<Item>() : Promise.resolve({ results: [] as Item[] }),
    db.prepare('SELECT external_id, status, subtype, refund_at, date_closed, external_created_at FROM returns WHERE workspace_id = ?1 AND claim_id = ?2').bind(workspaceId, claim.id).all<Return>(),
    db.prepare('SELECT sender_role, receiver_role, message_text, message_date, external_created_at FROM customer_messages WHERE workspace_id = ?1 AND claim_id = ?2 ORDER BY message_date ASC').bind(workspaceId, claim.id).all<StoredMessage>(),
    db.prepare('SELECT ea.external_id, ea.original_filename, ea.mime_type, ea.size_bytes, ea.external_created_at FROM claim_evidence ce JOIN evidence_assets ea ON ea.id = ce.evidence_asset_id WHERE ce.workspace_id = ?1 AND ce.claim_id = ?2 ORDER BY ea.external_created_at ASC').bind(workspaceId, claim.id).all<Asset>(),
  ])
  const timeline: EvidencePack['timeline'] = []
  event(timeline, 'ORDER_CREATED', order?.external_created_at ?? null, 'ORDER', 'Pedido criado')
  event(timeline, 'CLAIM_CREATED', claim.external_created_at, 'CLAIM', 'Reclamação criada')
  for (const message of messages.results) event(timeline, 'MESSAGE', message.message_date ?? message.external_created_at, 'MESSAGE', 'Mensagem registrada')
  for (const returned of returns.results) { event(timeline, 'RETURN_CREATED', returned.external_created_at, 'RETURN', 'Devolução criada'); event(timeline, 'REFUND_RECORDED', returned.refund_at, 'RETURN', 'Reembolso registrado'); event(timeline, 'RETURN_CLOSED', returned.date_closed, 'RETURN', 'Devolução encerrada') }
  event(timeline, 'CLAIM_UPDATED', claim.external_updated_at, 'CLAIM', 'Reclamação atualizada')
  event(timeline, 'DEADLINE', claim.due_date, 'CLAIM', 'Prazo da reclamação')
  timeline.sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime() || left.type.localeCompare(right.type))
  const missingEvidence: string[] = []
  if (claim.resource === 'order' && !order) missingEvidence.push('ORDER_NOT_LINKED')
  if (order && order.paid_amount === null && order.total_amount === null) missingEvidence.push('ORDER_AMOUNT_MISSING')
  if (order && items.results.length === 0) missingEvidence.push('ORDER_ITEMS_MISSING')
  if (claim.status?.toLowerCase() !== 'closed' && !claim.due_date) missingEvidence.push('DEADLINE_MISSING')
  if (messages.results.length === 0) missingEvidence.push('NO_CLAIM_MESSAGES')
  if (assets.results.length === 0) missingEvidence.push('NO_ATTACHMENT_EVIDENCE')
  if (claim.has_return === 1 && returns.results.length === 0) missingEvidence.push('RETURN_DATA_MISSING')
  return {
    externalClaimId,
    claim: { status: claim.status, type: claim.type, stage: claim.stage, reasonId: claim.reason_id, title: claim.title, problem: claim.problem, dueDate: claim.due_date, createdAt: claim.external_created_at, updatedAt: claim.external_updated_at },
    order: order ? { externalOrderId: order.external_id, status: order.status, currencyId: order.currency_id, totalAmount: order.total_amount, paidAmount: order.paid_amount, createdAt: order.external_created_at } : null,
    items: items.results.map((item) => ({ externalItemId: item.external_item_id, title: item.title, sellerSku: item.seller_sku, quantity: item.quantity, unitPrice: item.unit_price, productStatus: item.product_status, categoryId: item.category_id })),
    returns: returns.results.map((returned) => ({ externalReturnId: returned.external_id, status: returned.status, subtype: returned.subtype, refundAt: returned.refund_at, closedAt: returned.date_closed })),
    messages: messages.results.map((message) => ({ senderRole: message.sender_role, receiverRole: message.receiver_role, messageText: message.message_text, messageDate: message.message_date })),
    assets: assets.results.map((asset) => ({ externalId: asset.external_id, originalFilename: asset.original_filename, mimeType: asset.mime_type, sizeBytes: asset.size_bytes, createdAt: asset.external_created_at })),
    timeline,
    missingEvidence,
  }
}

export async function downloadEvidenceAsset(input: EvidenceInput, workspaceId: string, externalClaimId: string, assetExternalId: string): Promise<Response> {
  const claim = await getClaim(input.db, workspaceId, externalClaimId)
  const asset = await input.db.prepare('SELECT external_id, original_filename, mime_type FROM evidence_assets WHERE workspace_id = ?1 AND claim_id = ?2 AND external_id = ?3').bind(workspaceId, claim.id, assetExternalId).first<{ external_id: string; original_filename: string | null; mime_type: string | null }>()
  if (!asset) throw new EvidenceError('ASSET_NOT_FOUND')
  const token = await accessToken(input.db, workspaceId, input)
  const response = await (input.fetcher ?? fetch)(new URL(`/post-purchase/v1/claims/${encodeURIComponent(externalClaimId)}/attachments/${encodeURIComponent(asset.external_id)}/download`, API_URL).toString(), { headers: { authorization: `Bearer ${token}` } })
  if (!response.ok) throw new EvidenceError('REMOTE_API_ERROR')
  const filename = (asset.original_filename ?? asset.external_id).replace(/[\\/\r\n"]/g, '_').slice(0, 125) || 'attachment'
  return new Response(response.body, { headers: { 'content-type': response.headers.get('content-type') ?? asset.mime_type ?? 'application/octet-stream', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'private, no-store' } })
}
