import { DEFENSE_INSTRUCTIONS, DEFENSE_PROMPT_NAME, DEFENSE_PROMPT_VERSION, AIProvider, AIProviderError } from './ai-provider'
import { EvidenceError, EvidencePack, getEvidencePack } from './evidence'
import { getRiskCase } from './returnshield'
import type { D1Database } from './types'

export type DefenseAnalysis = { summary: string; riskExplanation: string; keyFacts: Array<{ text: string; sourceRefs: string[] }>; inconsistencies: Array<{ text: string; sourceRefs: string[] }>; evidenceSuggestions: string[]; recommendedResponse: string; confidence: number }
export type DefenseResponse = { analysis: DefenseAnalysis; cacheHit: boolean; model: string; promptVersion: string }
type StoredAnalysis = { id: string; status: 'RUNNING' | 'SUCCESS' | 'FAILED'; output_json: string | null; started_at: string | null }
export const DEFENSE_ANALYSIS_RUNNING_TIMEOUT_MS = 10 * 60 * 1000

const schema = { type: 'object', additionalProperties: false, required: ['summary', 'riskExplanation', 'keyFacts', 'inconsistencies', 'evidenceSuggestions', 'recommendedResponse', 'confidence'], properties: { summary: { type: 'string' }, riskExplanation: { type: 'string' }, keyFacts: { type: 'array', items: { type: 'object', required: ['text', 'sourceRefs'], properties: { text: { type: 'string' }, sourceRefs: { type: 'array', items: { type: 'string' } } } } }, inconsistencies: { type: 'array', items: { type: 'object', required: ['text', 'sourceRefs'], properties: { text: { type: 'string' }, sourceRefs: { type: 'array', items: { type: 'string' } } } } }, evidenceSuggestions: { type: 'array', items: { type: 'string' } }, recommendedResponse: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 100 } } }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value)
}
async function hash(value: unknown): Promise<string> { const bytes = new TextEncoder().encode(canonical(value)); const digest = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, '0')).join('') }
function add(catalog: Array<{ ref: string; type: string }>, ref: string, value: unknown, type = 'field') { if (value !== null && value !== undefined) catalog.push({ ref, type }) }

export function buildDefenseInput(pack: EvidencePack, risk: Awaited<ReturnType<typeof getRiskCase>>): { input: Record<string, unknown>; sourceCatalog: Array<{ ref: string; type: string }> } {
  if (!risk) throw new Error('Risk case unavailable')
  const catalog: Array<{ ref: string; type: string }> = []
  const evidence = structuredClone(pack) as EvidencePack
  let total = 0; let truncated = false
  evidence.messages = evidence.messages.slice(0, 50).map((message, index) => {
    const original = message.messageText ?? ''; const available = Math.max(0, 50_000 - total); const text = original.slice(0, Math.min(2_000, available)); total += text.length; if (text.length !== original.length) truncated = true
    add(catalog, `message:${index}`, text, 'message'); return { ...message, messageText: text }
  })
  if (pack.messages.length > evidence.messages.length) truncated = true
  add(catalog, 'claim.status', pack.claim.status); add(catalog, 'claim.reason', pack.claim.reasonId); add(catalog, 'claim.problem', pack.claim.problem); add(catalog, 'claim.due_date', pack.claim.dueDate)
  if (pack.order) { add(catalog, 'order.status', pack.order.status); add(catalog, 'order.paid_amount', pack.order.paidAmount) }
  evidence.items.forEach((_item, index) => catalog.push({ ref: `item:${index}`, type: 'item' })); evidence.returns.forEach((_item, index) => catalog.push({ ref: `return:${index}`, type: 'return' })); evidence.timeline.forEach((_item, index) => catalog.push({ ref: `timeline:${index}`, type: 'timeline' })); evidence.assets.forEach((_item, index) => catalog.push({ ref: `asset:${index}`, type: 'asset' })); evidence.missingEvidence.forEach((item) => catalog.push({ ref: `missing:${item}`, type: 'missing' }))
  return { sourceCatalog: catalog, input: { promptVersion: DEFENSE_PROMPT_VERSION, risk: { riskScore: risk.riskScore, severity: risk.severity, estimatedExposure: risk.estimatedExposure, currencyId: risk.currencyId, amountKnown: risk.amountKnown, deadlineAt: risk.deadlineAt, overdue: risk.overdue, reasons: risk.reasons }, evidence, sourceCatalog: catalog, truncated } }
}

function validOutput(value: unknown, catalog: Set<string>): DefenseAnalysis {
  const item = value as Partial<DefenseAnalysis>
  if (!item || typeof item.summary !== 'string' || typeof item.riskExplanation !== 'string' || typeof item.recommendedResponse !== 'string' || !Array.isArray(item.keyFacts) || !Array.isArray(item.inconsistencies) || !Array.isArray(item.evidenceSuggestions) || typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 100) throw new AIProviderError('AI_INVALID_OUTPUT')
  const facts = (entries: unknown[]) => entries.filter((entry): entry is { text: string; sourceRefs: string[] } => typeof (entry as { text?: unknown }).text === 'string' && Array.isArray((entry as { sourceRefs?: unknown }).sourceRefs)).map((entry) => ({ text: entry.text, sourceRefs: entry.sourceRefs.filter((ref) => catalog.has(ref)) }))
  return { summary: item.summary, riskExplanation: item.riskExplanation, keyFacts: facts(item.keyFacts), inconsistencies: facts(item.inconsistencies), evidenceSuggestions: item.evidenceSuggestions.filter((entry): entry is string => typeof entry === 'string'), recommendedResponse: item.recommendedResponse, confidence: item.confidence }
}

async function audit(db: D1Database, workspaceId: string, claimId: string, action: string) { await db.prepare("INSERT INTO audit_logs (id, workspace_id, actor_type, actor_id, action, entity_type, entity_id, source) VALUES (?1, ?2, 'AI', NULL, ?3, 'CLAIM', ?4, 'selleros')").bind(crypto.randomUUID(), workspaceId, action, claimId).run() }
async function usage(db: D1Database, workspaceId: string, claimId: string, provider: string, model: string, inputHash: string, cacheHit: boolean, status: string, errorCode: string | null, inputUnits: number | null = null, outputUnits: number | null = null, latencyMs: number | null = null) { await db.prepare("INSERT INTO ai_usage (id, workspace_id, claim_id, provider, model, purpose, prompt_name, prompt_version, input_hash, cache_hit, input_units, output_units, estimated_cost_usd, latency_ms, status, error_code) VALUES (?1, ?2, ?3, ?4, ?5, 'DEFENSE_ANALYSIS', ?6, ?7, ?8, ?9, ?10, ?11, NULL, ?12, ?13, ?14)").bind(crypto.randomUUID(), workspaceId, claimId, provider, model, DEFENSE_PROMPT_NAME, DEFENSE_PROMPT_VERSION, inputHash, cacheHit ? 1 : 0, inputUnits, outputUnits, latencyMs, status, errorCode).run() }

export class DefenseError extends Error { constructor(readonly code: 'CLAIM_NOT_FOUND' | 'ANALYSIS_IN_PROGRESS' | 'COPILOT_UNAVAILABLE') { super(code) } }
export class DefenseCopilotService {
  constructor(private readonly db: D1Database, private readonly provider: AIProvider, private readonly model: string, private readonly now: () => Date = () => new Date()) {}
  async analyze(workspaceId: string, externalClaimId: string): Promise<DefenseResponse> {
    let pack: EvidencePack; try { pack = await getEvidencePack(this.db, workspaceId, externalClaimId) } catch (cause) { if (cause instanceof EvidenceError && cause.code === 'CLAIM_NOT_FOUND') throw new DefenseError('CLAIM_NOT_FOUND'); throw cause }
    const risk = await getRiskCase(this.db, workspaceId, externalClaimId); if (!risk) throw new DefenseError('CLAIM_NOT_FOUND')
    const prepared = buildDefenseInput(pack, risk); const inputHash = await hash({ promptName: DEFENSE_PROMPT_NAME, promptVersion: DEFENSE_PROMPT_VERSION, model: this.model, input: prepared.input }); const catalog = new Set(prepared.sourceCatalog.map((item) => item.ref))
    const existing = await this.db.prepare('SELECT id, status, output_json, started_at FROM defense_analyses WHERE workspace_id = ?1 AND claim_id = ?2 AND prompt_name = ?3 AND prompt_version = ?4 AND input_hash = ?5').bind(workspaceId, risk.claimId, DEFENSE_PROMPT_NAME, DEFENSE_PROMPT_VERSION, inputHash).first<StoredAnalysis>()
    const startedAt = existing?.started_at ? new Date(existing.started_at).getTime() : NaN
    if (existing?.status === 'RUNNING' && Number.isFinite(startedAt) && this.now().getTime() - startedAt < DEFENSE_ANALYSIS_RUNNING_TIMEOUT_MS) throw new DefenseError('ANALYSIS_IN_PROGRESS')
    if (existing?.status === 'SUCCESS' && existing.output_json) { const analysis = validOutput(JSON.parse(existing.output_json), catalog); await usage(this.db, workspaceId, risk.claimId, this.provider.name, this.model, inputHash, true, 'SUCCESS', null); return { analysis, cacheHit: true, model: this.model, promptVersion: DEFENSE_PROMPT_VERSION } }
    const id = existing?.id ?? crypto.randomUUID(); const started = this.now().toISOString(); if (existing) { const recovered = await this.db.prepare("UPDATE defense_analyses SET status = 'RUNNING', error_code = NULL, started_at = ?1, finished_at = NULL, updated_at = datetime('now') WHERE id = ?2 AND status = 'RUNNING' AND started_at IS ?3").bind(started, id, existing.started_at).run(); if (recovered.meta?.changes !== 1) throw new DefenseError('ANALYSIS_IN_PROGRESS') } else await this.db.prepare("INSERT INTO defense_analyses (id, workspace_id, claim_id, external_claim_id, prompt_name, prompt_version, provider, model, input_hash, status, started_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'RUNNING', ?10)").bind(id, workspaceId, risk.claimId, externalClaimId, DEFENSE_PROMPT_NAME, DEFENSE_PROMPT_VERSION, this.provider.name, this.model, inputHash, started).run(); await audit(this.db, workspaceId, risk.claimId, 'DEFENSE_ANALYSIS_REQUESTED')
    try {
      let generated; try { generated = await this.provider.generateStructured<DefenseAnalysis>({ instructions: DEFENSE_INSTRUCTIONS, input: prepared.input, model: this.model }, schema); validOutput(generated.output, catalog) } catch (cause) { if (!(cause instanceof AIProviderError && cause.code === 'AI_INVALID_OUTPUT')) throw cause; generated = await this.provider.generateStructured<DefenseAnalysis>({ instructions: `${DEFENSE_INSTRUCTIONS}\nReturn only valid schema JSON.`, input: prepared.input, model: this.model }, schema) }
      const analysis = validOutput(generated.output, catalog); await this.db.prepare("UPDATE defense_analyses SET status = 'SUCCESS', output_json = ?1, finished_at = ?2, updated_at = datetime('now') WHERE id = ?3").bind(JSON.stringify(analysis), new Date().toISOString(), id).run(); await usage(this.db, workspaceId, risk.claimId, this.provider.name, this.model, inputHash, false, 'SUCCESS', null, generated.inputUnits, generated.outputUnits, generated.latencyMs); await audit(this.db, workspaceId, risk.claimId, 'DEFENSE_ANALYSIS_COMPLETED'); return { analysis, cacheHit: false, model: this.model, promptVersion: DEFENSE_PROMPT_VERSION }
    } catch (cause) { const code = cause instanceof AIProviderError ? cause.code : 'AI_UNAVAILABLE'; await this.db.prepare("UPDATE defense_analyses SET status = 'FAILED', error_code = ?1, finished_at = ?2, updated_at = datetime('now') WHERE id = ?3").bind(code, new Date().toISOString(), id).run(); await usage(this.db, workspaceId, risk.claimId, this.provider.name, this.model, inputHash, false, 'FAILED', code); await audit(this.db, workspaceId, risk.claimId, 'DEFENSE_ANALYSIS_FAILED'); throw new DefenseError('COPILOT_UNAVAILABLE') }
  }
  async latest(workspaceId: string, externalClaimId: string): Promise<DefenseResponse | null> { const risk = await getRiskCase(this.db, workspaceId, externalClaimId); if (!risk) throw new DefenseError('CLAIM_NOT_FOUND'); const row = await this.db.prepare("SELECT output_json, model, prompt_version FROM defense_analyses WHERE workspace_id = ?1 AND claim_id = ?2 AND status = 'SUCCESS' ORDER BY finished_at DESC LIMIT 1").bind(workspaceId, risk.claimId).first<{ output_json: string; model: string; prompt_version: string }>(); if (!row) return null; const pack = await getEvidencePack(this.db, workspaceId, externalClaimId); const refs = new Set(buildDefenseInput(pack, risk).sourceCatalog.map((item) => item.ref)); return { analysis: validOutput(JSON.parse(row.output_json), refs), cacheHit: true, model: row.model, promptVersion: row.prompt_version } }
}
