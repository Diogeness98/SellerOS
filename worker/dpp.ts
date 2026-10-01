import type { D1Database, Env } from './types'

export const DPP_STATUSES = ['NOT_STARTED', 'PARTIAL', 'PASS', 'FAIL', 'NOT_APPLICABLE', 'NEEDS_REVIEW'] as const
export type DppStatus = (typeof DPP_STATUSES)[number]
const forbidden = /access_token|refresh_token|client_secret|password_hash|session_secret/i

type Check = { code: string; category: string; title: string; description: string; status: DppStatus; requirement_type: string; evidence_count: number; notes: string | null; source_url: string | null; source_verified_at: string | null }
type Config = { code: string; value: string; source: string; verified_at: string | null }

export function containsSensitiveValue(value: string): boolean { return forbidden.test(value) }
export async function isPlatformAdmin(db: D1Database, userId: string): Promise<boolean> {
  return Boolean(await db.prepare('SELECT user_id FROM platform_admins WHERE user_id = ?1').bind(userId).first())
}

export async function getDppReadiness(db: D1Database, env: Env) {
  const [checksResult, configResult] = await Promise.all([
    db.prepare('SELECT code, category, title, description, status, requirement_type, evidence_count, notes, source_url, source_verified_at FROM dpp_readiness_checks ORDER BY category, code').all<Check>(),
    db.prepare('SELECT code, value, source, verified_at FROM dpp_configuration ORDER BY code').all<Config>(),
  ])
  const checks = checksResult.results.map((check) => check.code === 'ML_APP_CONFIGURED' ? { ...check, status: env.MERCADOLIVRE_CLIENT_ID && env.MERCADOLIVRE_REDIRECT_URI ? 'PASS' as DppStatus : 'PARTIAL' as DppStatus } : check)
  const applicable = checks.filter((check) => check.status !== 'NOT_APPLICABLE')
  const verified = applicable.filter((check) => check.status === 'PASS').length
  return { checks, configuration: configResult.results, internalReadinessPercent: applicable.length ? Math.round((verified / applicable.length) * 100) : 0, disclaimer: 'Indicadores internos de preparação. O Mercado Livre é responsável pela avaliação e aprovação oficial do Developer Partner Program.' }
}

export async function getDppGmve(db: D1Database) {
  const [monthly, health, config] = await Promise.all([
    db.prepare(`SELECT substr(COALESCE(external_closed_at, external_created_at), 1, 7) AS period, COUNT(DISTINCT workspace_id) AS active_sellers, COUNT(*) AS orders_count, COALESCE(SUM(COALESCE(paid_amount, total_amount)), 0) AS gross_amount_brl FROM orders WHERE channel = 'MERCADOLIVRE' AND currency_id = 'BRL' AND COALESCE(external_closed_at, external_created_at) IS NOT NULL GROUP BY period ORDER BY period DESC LIMIT 12`).all<{ period: string; active_sellers: number; orders_count: number; gross_amount_brl: number }>(),
    db.prepare(`SELECT (SELECT COUNT(*) FROM integrations WHERE channel = 'MERCADOLIVRE' AND status = 'CONNECTED') AS connected_sellers, (SELECT COUNT(DISTINCT workspace_id) FROM orders WHERE channel = 'MERCADOLIVRE' AND COALESCE(external_closed_at, external_created_at) >= datetime('now', '-3 months')) AS active_sellers, (SELECT COUNT(*) FROM integrations WHERE channel = 'MERCADOLIVRE' AND status = 'CONNECTED' AND last_sync_at >= datetime('now', '-30 days')) AS healthy_sellers, (SELECT COUNT(*) FROM integrations WHERE channel = 'MERCADOLIVRE' AND status <> 'CONNECTED') AS disconnected_sellers`).first<{ connected_sellers: number; active_sellers: number; healthy_sellers: number; disconnected_sellers: number }>(),
    db.prepare("SELECT value FROM dpp_configuration WHERE code = 'DPP_GMVE_TARGET_USD'").first<{ value: string }>(),
  ])
  const snapshots = await db.prepare('SELECT period, fx_rate, fx_date, fx_source, gmve_usd_estimate FROM dpp_gmve_monthly').all<{ period: string; fx_rate: number | null; fx_date: string | null; fx_source: string | null; gmve_usd_estimate: number | null }>()
  const byPeriod = new Map(snapshots.results.map((row) => [row.period, row]))
  const rows = monthly.results.map((row) => ({ ...row, ...(byPeriod.get(row.period) ?? { fx_rate: null, fx_date: null, fx_source: null, gmve_usd_estimate: null }) }))
  const gmveUsd = rows.reduce<number | null>((total, row) => total === null || row.gmve_usd_estimate === null ? null : total + row.gmve_usd_estimate, rows.length ? 0 : null)
  const targetUsd = Number(config?.value ?? 2500000)
  return { months: rows, health: health ?? { connected_sellers: 0, active_sellers: 0, healthy_sellers: 0, disconnected_sellers: 0 }, totalGmvBrl: rows.reduce((total, row) => total + Number(row.gross_amount_brl), 0), gmveUsdEstimate: gmveUsd, targetUsd, targetProgressPercent: gmveUsd === null || !targetUsd ? null : (gmveUsd / targetUsd) * 100 }
}

export function initiativeDeadline(dueAt: string | null): 'OK' | 'ATENCAO' | 'VENCIDO' | null {
  if (!dueAt) return null
  const days = (new Date(dueAt).getTime() - Date.now()) / 86_400_000
  return days < 0 ? 'VENCIDO' : days <= 14 ? 'ATENCAO' : 'OK'
}
