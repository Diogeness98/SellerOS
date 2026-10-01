import { getReturnShieldDashboard, scoreRiskCase, type RiskCase, type Severity } from './returnshield'
import type { D1Database } from './types'

export type ReputationImpact = 'AFFECTED' | 'NOT_AFFECTED' | 'NOT_APPLICABLE' | 'UNKNOWN'
export type RecoveryAttribution = 'CONFIRMED_RECOVERED' | 'ASSISTED' | 'NOT_ATTRIBUTABLE' | 'PENDING'
type Row = Parameters<typeof scoreRiskCase>[0] & { reputation_impact: ReputationImpact; messages: number; assets: number }

export type ActionCase = { externalClaimId: string; priority: Severity; actionPriorityScore: number; breakdown: { financial: number; deadline: number; reputation: number; requiredAction: number; evidence: number; total: number }; estimatedExposure: number | null; currencyId: string | null; deadlineAt: string | null; reputationImpact: ReputationImpact; evidenceReadiness: number; requiredAction: string | null; title: string | null }

function readiness(row: Row): number { return (row.order_id ? 20 : 0) + (row.messages > 0 ? 25 : 0) + (row.assets > 0 ? 20 : 0) + (row.due_date ? 15 : 0) + (row.has_return ? 20 : 0) }
function priority(total: number): Severity { return total >= 75 ? 'CRITICAL' : total >= 50 ? 'HIGH' : total >= 25 ? 'MEDIUM' : 'LOW' }
function actionFor(risk: RiskCase, evidence: number): string | null { if (risk.overdue || (risk.hoursToDeadline !== null && risk.hoursToDeadline <= 24)) return 'Revisar prazo e evidências'; if (evidence < 60) return 'Completar evidências'; return risk.status?.toLowerCase() === 'closed' ? null : 'Revisar caso' }
export function buildActionQueue(rows: Row[], now = new Date()): ActionCase[] {
  return rows.map((row) => {
    const risk = scoreRiskCase(row, now); const evidenceReadiness = readiness(row); const requiredAction = actionFor(risk, evidenceReadiness)
    const breakdown = { financial: Math.min(30, Math.round(risk.financialRisk * 0.6)), deadline: Math.min(25, Math.round(risk.urgencyRisk * 0.625)), reputation: row.reputation_impact === 'AFFECTED' ? 20 : 0, requiredAction: requiredAction ? 15 : 0, evidence: Math.min(10, Math.round((100 - evidenceReadiness) / 10)), total: 0 }
    breakdown.total = Math.min(100, breakdown.financial + breakdown.deadline + breakdown.reputation + breakdown.requiredAction + breakdown.evidence)
    return { externalClaimId: risk.externalClaimId, priority: priority(breakdown.total), actionPriorityScore: breakdown.total, breakdown, estimatedExposure: risk.estimatedExposure, currencyId: risk.currencyId, deadlineAt: risk.deadlineAt, reputationImpact: row.reputation_impact, evidenceReadiness, requiredAction, title: risk.title }
  }).filter((item) => item.priority !== 'LOW' || item.requiredAction !== null).sort((a, b) => b.actionPriorityScore - a.actionPriorityScore || a.externalClaimId.localeCompare(b.externalClaimId))
}
export async function getValidationDashboard(db: D1Database, workspaceId: string) {
  const rows = await db.prepare(`SELECT c.id AS claim_id, c.external_id AS external_claim_id, c.order_id, c.status, c.has_return, c.due_date, c.title, c.problem, c.reputation_impact, o.external_id AS external_order_id, o.paid_amount, o.total_amount, o.currency_id, (SELECT COUNT(*) FROM customer_messages m WHERE m.workspace_id=c.workspace_id AND m.claim_id=c.id) AS messages, (SELECT COUNT(*) FROM evidence_assets a WHERE a.workspace_id=c.workspace_id AND a.claim_id=c.id) AS assets FROM claims c LEFT JOIN orders o ON o.id=c.order_id AND o.workspace_id=c.workspace_id WHERE c.workspace_id=?1`).bind(workspaceId).all<Row>()
  const queue = buildActionQueue(rows.results)
  const impact = await db.prepare(`SELECT COALESCE(SUM(amount_at_risk_cents),0) AS monitored, COALESCE(SUM(recovered_amount_cents),0) AS recovered, COALESCE(SUM(protected_amount_cents),0) AS protected, COALESCE(SUM(lost_amount_cents),0) AS lost, SUM(CASE WHEN attribution_status='PENDING' THEN 1 ELSE 0 END) AS pending FROM return_financial_outcomes WHERE workspace_id=?1`).bind(workspaceId).first<{ monitored: number; recovered: number; protected: number; lost: number; pending: number }>()
  const dashboard = await getReturnShieldDashboard(db, workspaceId)
  return { actionQueue: queue.slice(0, 20), reputationShield: { affectedCases: queue.filter((item) => item.reputationImpact === 'AFFECTED').length, dueToday: queue.filter((item) => item.deadlineAt && new Date(item.deadlineAt).getTime() - Date.now() <= 24 * 60 * 60 * 1000).length, associatedAtRisk: queue.filter((item) => item.reputationImpact === 'AFFECTED').reduce((sum, item) => sum + (item.estimatedExposure ?? 0), 0) }, impact: { currency: 'BRL', monitoredCents: impact?.monitored ?? 0, recoveredCents: impact?.recovered ?? 0, protectedCents: impact?.protected ?? 0, lostCents: impact?.lost ?? 0, pendingCases: impact?.pending ?? 0 }, firstValue: { moneyAtRisk: dashboard.moneyAtRisk.estimatedAmount, openCases: dashboard.openCases, criticalCases: dashboard.criticalCases, actionCases: queue.length } }
}
export async function recordValidationEvent(db: D1Database, workspaceId: string, eventName: string, metadata: Record<string, number | boolean> = {}) { await db.prepare('INSERT INTO validation_events (id, workspace_id, event_name, metadata_json) VALUES (?1, ?2, ?3, ?4)').bind(crypto.randomUUID(), workspaceId, eventName, JSON.stringify(metadata)).run() }
