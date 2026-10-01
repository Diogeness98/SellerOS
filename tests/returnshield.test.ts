import { describe, expect, it } from 'vitest'
import { createSession, createSessionToken } from '../shared/auth'
import { returnShieldEmptyMessage } from '../apps/web/src/App'
import { handleRequest } from '../worker/api'
import { buildDashboard, getReturnShieldDashboard, RISK_ENGINE_VERSION, scoreRiskCase } from '../worker/returnshield'
import type { D1Database, D1Result, D1Statement, Env } from '../worker/types'

const now = new Date('2026-10-01T12:00:00.000Z')

function claim(overrides: Record<string, unknown> = {}) {
  return {
    claim_id: 'claim-1', external_claim_id: 'MLC1', order_id: 'order-1', external_order_id: 'ORDER-1', status: 'opened', has_return: 0,
    due_date: '2026-10-10T12:00:00.000Z', title: 'Item damaged', problem: 'Damaged item', paid_amount: 40, total_amount: 50, currency_id: 'BRL',
    ...overrides,
  }
}

class DashboardStatement implements D1Statement {
  constructor(private readonly db: DashboardDb, private readonly values: unknown[] = []) {}
  bind(...values: unknown[]): D1Statement { return new DashboardStatement(this.db, values) }
  async first<T>(): Promise<T | null> { return null }
  async all<T>(): Promise<D1Result<T>> { return { results: (this.db.rowsByWorkspace.get(String(this.values[0])) ?? []) as T[], success: true } }
  async run(): Promise<D1Result> { return { results: [], success: true } }
}

class DashboardDb implements D1Database {
  constructor(readonly rowsByWorkspace: Map<string, ReturnType<typeof claim>[]>) {}
  prepare(): D1Statement { return new DashboardStatement(this) }
}

describe('ReturnShield Risk Engine V1', () => {
  it('scores a low-value BRL case deterministically', () => {
    const result = scoreRiskCase(claim(), now)
    expect({ version: RISK_ENGINE_VERSION, score: result.riskScore, severity: result.severity }).toEqual({ version: 'v1', score: 13, severity: 'LOW' })
    expect(scoreRiskCase(claim(), now)).toEqual(result)
  })

  it('combines high financial exposure, urgent deadline, and return risk', () => {
    const result = scoreRiskCase(claim({ paid_amount: 800, due_date: '2026-10-02T12:00:00.000Z', has_return: 1 }), now)
    expect(result).toMatchObject({ financialRisk: 35, urgencyRisk: 35, returnRisk: 10, riskScore: 80, severity: 'CRITICAL' })
    expect(result.reasons).toEqual(expect.arrayContaining(['high_financial_exposure', 'deadline_within_24h', 'return_in_progress']))
  })

  it('scores overdue, 72-hour, and missing deadlines', () => {
    expect(scoreRiskCase(claim({ due_date: '2026-10-01T11:00:00.000Z' }), now)).toMatchObject({ urgencyRisk: 40, overdue: true, reasons: expect.arrayContaining(['deadline_overdue']) })
    expect(scoreRiskCase(claim({ due_date: '2026-10-04T12:00:00.000Z' }), now)).toMatchObject({ urgencyRisk: 28, reasons: expect.arrayContaining(['deadline_within_72h']) })
    expect(scoreRiskCase(claim({ due_date: null }), now)).toMatchObject({ urgencyRisk: 12, reasons: expect.arrayContaining(['deadline_missing']) })
  })

  it('handles closed claims, unknown amounts, and non-BRL amounts safely', () => {
    expect(scoreRiskCase(claim({ status: 'closed', paid_amount: 900 }), now)).toMatchObject({ riskScore: 0, severity: 'LOW', estimatedExposure: 0 })
    expect(scoreRiskCase(claim({ paid_amount: null, total_amount: null }), now)).toMatchObject({ amountKnown: false, financialRisk: 10, estimatedExposure: null, reasons: expect.arrayContaining(['amount_unknown']) })
    expect(scoreRiskCase(claim({ currency_id: 'USD', paid_amount: 900 }), now)).toMatchObject({ amountKnown: true, financialRisk: 10, reasons: expect.arrayContaining(['currency_not_scored']) })
  })

  it('caps the score at 100 and uses the requested severity boundaries', () => {
    expect(scoreRiskCase(claim({ paid_amount: 5000, due_date: '2026-10-01T11:00:00.000Z', has_return: 1 }), now)).toMatchObject({ riskScore: 100, severity: 'CRITICAL' })
    expect(scoreRiskCase(claim({ paid_amount: 300, due_date: '2026-10-10T12:00:00.000Z' }), now).severity).toBe('MEDIUM')
    expect(scoreRiskCase(claim({ paid_amount: 800, due_date: '2026-10-04T12:00:00.000Z' }), now).severity).toBe('HIGH')
  })
})

describe('ReturnShield dashboard', () => {
  it('deduplicates Money at Risk by order and sums distinct orders', () => {
    const dashboard = buildDashboard([
      claim({ claim_id: 'one', external_claim_id: '1', paid_amount: 300 }),
      claim({ claim_id: 'two', external_claim_id: '2', paid_amount: 300 }),
      claim({ claim_id: 'three', external_claim_id: '3', order_id: 'order-2', paid_amount: 200 }),
    ], now)
    expect(dashboard.moneyAtRisk).toEqual({ currency: 'BRL', estimatedAmount: 500, pricedCases: 2, unpricedCases: 0 })
  })

  it('excludes closed claims and unknown or non-BRL amounts from the BRL total', () => {
    const dashboard = buildDashboard([
      claim({ status: 'closed', paid_amount: 1000 }),
      claim({ claim_id: 'unknown', external_claim_id: 'unknown', order_id: null, paid_amount: null, total_amount: null }),
      claim({ claim_id: 'usd', external_claim_id: 'usd', order_id: 'order-usd', paid_amount: 20, currency_id: 'USD' }),
    ], now)
    expect(dashboard).toMatchObject({ openCases: 2, moneyAtRisk: { estimatedAmount: 0, pricedCases: 0, unpricedCases: 2 } })
    expect(dashboard.priorityCases.map((item) => item.externalClaimId)).not.toContain('MLC1')
  })

  it('orders priorities deterministically and limits them to twenty', () => {
    const rows = Array.from({ length: 21 }, (_, index) => claim({ claim_id: `claim-${index}`, external_claim_id: String(index).padStart(2, '0'), order_id: `order-${index}`, paid_amount: 2000, due_date: index === 0 ? '2026-10-02T12:00:00.000Z' : '2026-10-03T12:00:00.000Z' }))
    const dashboard = buildDashboard(rows, now)
    expect(dashboard.priorityCases).toHaveLength(20)
    expect(dashboard.priorityCases[0].externalClaimId).toBe('00')
    expect(dashboard.priorityCases.at(-1)?.externalClaimId).toBe('19')
  })

  it('returns a correct zero-data dashboard and frontend empty state', async () => {
    const db = new DashboardDb(new Map([['workspace-a', []]]))
    await expect(getReturnShieldDashboard(db, 'workspace-a', now)).resolves.toEqual({
      moneyAtRisk: { currency: 'BRL', estimatedAmount: 0, pricedCases: 0, unpricedCases: 0 }, openCases: 0, criticalCases: 0, highCases: 0, overdueCases: 0, dueToday: 0, casesWithReturns: 0, priorityCases: [],
    })
    expect(returnShieldEmptyMessage(0)).toBe('Nenhum caso em risco encontrado.')
  })

  it('uses only the signed session workspace and returns no PII', async () => {
    const db = new DashboardDb(new Map([
      ['workspace-a', [claim({ external_claim_id: 'A', title: 'Safe title' })]],
      ['workspace-b', [claim({ external_claim_id: 'B', title: 'buyer@example.com' })]],
    ]))
    const secret = 'test-session-secret-with-at-least-32-chars'
    const token = await createSessionToken(createSession('user-a', 'workspace-a', 'OWNER'), secret)
    const env: Env = { DB: db, SESSION_SECRET: secret }
    const forbidden = await handleRequest(new Request('https://selleros.xxx/api/returnshield/dashboard'), env)
    expect(forbidden.status).toBe(403)
    const response = await handleRequest(new Request('https://selleros.xxx/api/returnshield/dashboard', { headers: { cookie: `selleros_session=${token}` } }), env)
    const body = JSON.stringify(await response.json())
    expect(response.status).toBe(200)
    expect(body).toContain('"A"')
    expect(body).not.toContain('buyer@example.com')
    expect(body).not.toContain('workspace-b')
  })
})
