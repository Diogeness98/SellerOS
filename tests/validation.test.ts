import { describe, expect, it } from 'vitest'
import { buildActionQueue } from '../worker/validation'

const now = new Date('2026-10-01T12:00:00.000Z')
function row(overrides: Record<string, unknown> = {}) {
  return { claim_id: 'claim-1', external_claim_id: 'claim-1', order_id: 'order-1', external_order_id: 'order-1', status: 'opened', has_return: 1, due_date: '2026-10-01T16:00:00.000Z', title: 'Case', problem: null, paid_amount: 1200, total_amount: 1200, currency_id: 'BRL', reputation_impact: 'AFFECTED' as const, messages: 1, assets: 0, ...overrides }
}

describe('ReturnShield validation engine', () => {
  it('prioritizes deterministic financial, deadline, reputation and evidence factors', () => {
    const queue = buildActionQueue([row(), row({ claim_id: 'claim-2', external_claim_id: 'claim-2', paid_amount: 100, due_date: '2026-10-10T12:00:00.000Z', reputation_impact: 'UNKNOWN', messages: 1, assets: 1 })], now)
    expect(queue[0]).toMatchObject({ externalClaimId: 'claim-1', priority: 'CRITICAL', reputationImpact: 'AFFECTED', evidenceReadiness: 80 })
    expect(queue[0].breakdown.total).toBe(queue[0].actionPriorityScore)
  })

  it('keeps unavailable reputation as UNKNOWN and identifies incomplete evidence', () => {
    const [item] = buildActionQueue([row({ reputation_impact: 'UNKNOWN', order_id: null, messages: 0, assets: 0 })], now)
    expect(item.reputationImpact).toBe('UNKNOWN')
    expect(item.evidenceReadiness).toBeLessThan(60)
    expect(item.requiredAction).toBe('Revisar prazo e evidências')
  })
})
