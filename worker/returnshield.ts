import type { D1Database } from './types'

export const RISK_ENGINE_VERSION = 'v1'

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

type ClaimRow = {
  claim_id: string
  external_claim_id: string
  order_id: string | null
  external_order_id: string | null
  status: string | null
  has_return: number
  due_date: string | null
  title: string | null
  problem: string | null
  paid_amount: number | null
  total_amount: number | null
  currency_id: string | null
}

export type RiskCase = {
  claimId: string
  externalClaimId: string
  orderId: string | null
  externalOrderId: string | null
  grossAmount: number | null
  estimatedExposure: number | null
  currencyId: string | null
  amountKnown: boolean
  deadlineAt: string | null
  hoursToDeadline: number | null
  financialRisk: number
  urgencyRisk: number
  returnRisk: number
  riskScore: number
  severity: Severity
  status: string | null
  hasReturn: boolean
  overdue: boolean
  title: string | null
  problem: string | null
  reasons: string[]
}

export type ReturnShieldDashboard = {
  moneyAtRisk: { currency: 'BRL'; estimatedAmount: number; pricedCases: number; unpricedCases: number }
  openCases: number
  criticalCases: number
  highCases: number
  overdueCases: number
  dueToday: number
  casesWithReturns: number
  priorityCases: Array<Pick<RiskCase, 'externalClaimId' | 'externalOrderId' | 'estimatedExposure' | 'currencyId' | 'amountKnown' | 'deadlineAt' | 'hoursToDeadline' | 'riskScore' | 'severity' | 'hasReturn' | 'overdue' | 'title' | 'problem' | 'reasons'>>
}

const HOUR = 60 * 60 * 1000

function severityFor(score: number): Severity {
  if (score >= 75) return 'CRITICAL'
  if (score >= 50) return 'HIGH'
  if (score >= 25) return 'MEDIUM'
  return 'LOW'
}

function validAmount(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function activeClaim(status: string | null): boolean {
  return status?.toLowerCase() !== 'closed'
}

export function scoreRiskCase(row: ClaimRow, now = new Date()): RiskCase {
  const isActive = activeClaim(row.status)
  const grossAmount = validAmount(row.paid_amount) ? row.paid_amount : validAmount(row.total_amount) ? row.total_amount : null
  const amountKnown = grossAmount !== null
  const hasReturn = row.has_return === 1
  const reasons: string[] = []
  let financialRisk = 0
  let urgencyRisk = 0
  let hoursToDeadline: number | null = null
  let overdue = false

  if (isActive) {
    if (!amountKnown) {
      financialRisk = 10
      reasons.push('amount_unknown')
    } else if (row.currency_id !== 'BRL') {
      financialRisk = 10
      reasons.push('currency_not_scored')
    } else if (grossAmount <= 50) financialRisk = 5
    else if (grossAmount <= 200) financialRisk = 12
    else if (grossAmount <= 500) financialRisk = 22
    else if (grossAmount <= 1000) financialRisk = 35
    else financialRisk = 50

    if (financialRisk >= 35) reasons.push('high_financial_exposure')

    const deadline = row.due_date ? new Date(row.due_date) : null
    if (!deadline || Number.isNaN(deadline.getTime())) {
      urgencyRisk = 12
      reasons.push('deadline_missing')
    } else {
      hoursToDeadline = Math.ceil((deadline.getTime() - now.getTime()) / HOUR)
      overdue = deadline.getTime() < now.getTime()
      if (overdue) {
        urgencyRisk = 40
        reasons.push('deadline_overdue')
      } else if (hoursToDeadline <= 24) {
        urgencyRisk = 35
        reasons.push('deadline_within_24h')
      } else if (hoursToDeadline <= 72) {
        urgencyRisk = 28
        reasons.push('deadline_within_72h')
      } else if (hoursToDeadline <= 24 * 7) urgencyRisk = 18
      else urgencyRisk = 8
    }
    if (hasReturn) reasons.push('return_in_progress')
  }

  const returnRisk = isActive && hasReturn ? 10 : 0
  const riskScore = isActive ? Math.min(100, financialRisk + urgencyRisk + returnRisk) : 0
  return {
    claimId: row.claim_id,
    externalClaimId: row.external_claim_id,
    orderId: row.order_id,
    externalOrderId: row.external_order_id,
    grossAmount,
    estimatedExposure: isActive && amountKnown ? grossAmount : isActive ? null : 0,
    currencyId: row.currency_id,
    amountKnown,
    deadlineAt: row.due_date,
    hoursToDeadline,
    financialRisk,
    urgencyRisk,
    returnRisk,
    riskScore,
    severity: severityFor(riskScore),
    status: row.status,
    hasReturn,
    overdue,
    title: row.title,
    problem: row.problem,
    reasons,
  }
}

function comparePriority(left: RiskCase, right: RiskCase): number {
  if (right.riskScore !== left.riskScore) return right.riskScore - left.riskScore
  const leftDeadline = left.deadlineAt ? new Date(left.deadlineAt).getTime() : Number.POSITIVE_INFINITY
  const rightDeadline = right.deadlineAt ? new Date(right.deadlineAt).getTime() : Number.POSITIVE_INFINITY
  if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline
  const leftExposure = left.estimatedExposure ?? Number.NEGATIVE_INFINITY
  const rightExposure = right.estimatedExposure ?? Number.NEGATIVE_INFINITY
  if (rightExposure !== leftExposure) return rightExposure - leftExposure
  return left.externalClaimId.localeCompare(right.externalClaimId)
}

export function buildDashboard(rows: ClaimRow[], now = new Date()): ReturnShieldDashboard {
  const active = rows.map((row) => scoreRiskCase(row, now)).filter((riskCase) => activeClaim(riskCase.status))
  const pricedOrderIds = new Set<string>()
  let estimatedAmount = 0
  let pricedCases = 0
  let unpricedCases = 0
  for (const riskCase of active) {
    if (riskCase.orderId && riskCase.amountKnown && riskCase.currencyId === 'BRL') {
      if (!pricedOrderIds.has(riskCase.orderId)) {
        pricedOrderIds.add(riskCase.orderId)
        estimatedAmount += riskCase.estimatedExposure ?? 0
        pricedCases += 1
      }
    } else {
      unpricedCases += 1
    }
  }
  const priorityCases = active.sort(comparePriority).slice(0, 20).map(({ claimId: _claimId, orderId: _orderId, grossAmount: _grossAmount, financialRisk: _financialRisk, urgencyRisk: _urgencyRisk, returnRisk: _returnRisk, status: _status, ...safe }) => safe)
  return {
    moneyAtRisk: { currency: 'BRL', estimatedAmount, pricedCases, unpricedCases },
    openCases: active.length,
    criticalCases: active.filter((riskCase) => riskCase.severity === 'CRITICAL').length,
    highCases: active.filter((riskCase) => riskCase.severity === 'HIGH').length,
    overdueCases: active.filter((riskCase) => riskCase.overdue).length,
    dueToday: active.filter((riskCase) => !riskCase.overdue && riskCase.hoursToDeadline !== null && riskCase.hoursToDeadline <= 24).length,
    casesWithReturns: active.filter((riskCase) => riskCase.hasReturn).length,
    priorityCases,
  }
}

export async function getReturnShieldDashboard(db: D1Database, workspaceId: string, now = new Date()): Promise<ReturnShieldDashboard> {
  const result = await db.prepare(`SELECT
      c.id AS claim_id, c.external_id AS external_claim_id, c.order_id, c.status, c.has_return, c.due_date, c.title, c.problem,
      o.external_id AS external_order_id, o.paid_amount, o.total_amount, o.currency_id
    FROM claims c
    LEFT JOIN orders o ON o.id = c.order_id AND o.workspace_id = c.workspace_id
    WHERE c.workspace_id = ?1 AND c.channel = 'MERCADOLIVRE'`).bind(workspaceId).all<ClaimRow>()
  return buildDashboard(result.results, now)
}

export async function getRiskCase(db: D1Database, workspaceId: string, externalClaimId: string, now = new Date()): Promise<RiskCase | null> {
  const row = await db.prepare(`SELECT c.id AS claim_id, c.external_id AS external_claim_id, c.order_id, c.status, c.has_return, c.due_date, c.title, c.problem,
      o.external_id AS external_order_id, o.paid_amount, o.total_amount, o.currency_id
    FROM claims c LEFT JOIN orders o ON o.id = c.order_id AND o.workspace_id = c.workspace_id
    WHERE c.workspace_id = ?1 AND c.channel = 'MERCADOLIVRE' AND c.external_id = ?2`).bind(workspaceId, externalClaimId).first<ClaimRow>()
  return row ? scoreRiskCase(row, now) : null
}
