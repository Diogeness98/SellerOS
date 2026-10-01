import { FormEvent, useEffect, useState } from 'react'

type Session = { authenticated: boolean; user?: { id: string; email: string }; workspaceId?: string }
type Integration = { connected: boolean; externalAccountId: string | null; lastSyncAt: string | null }
type PriorityCase = { externalClaimId: string; externalOrderId: string | null; estimatedExposure: number | null; currencyId: string | null; amountKnown: boolean; deadlineAt: string | null; hoursToDeadline: number | null; riskScore: number; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; hasReturn: boolean; overdue: boolean; title: string | null; problem: string | null; reasons: string[] }
type Dashboard = { moneyAtRisk: { currency: 'BRL'; estimatedAmount: number; pricedCases: number; unpricedCases: number }; openCases: number; criticalCases: number; highCases: number; overdueCases: number; dueToday: number; casesWithReturns: number; priorityCases: PriorityCase[] }
type EvidencePack = { externalClaimId: string; claim: { status: string | null; type: string | null; stage: string | null; reasonId: string | null; title: string | null; problem: string | null; dueDate: string | null; createdAt: string | null; updatedAt: string | null }; order: { externalOrderId: string; status: string | null; currencyId: string | null; totalAmount: number | null; paidAmount: number | null; createdAt: string | null } | null; items: Array<{ externalItemId: string; title: string | null; sellerSku: string | null; quantity: number; unitPrice: number | null; productStatus: string | null; categoryId: string | null }>; returns: Array<{ externalReturnId: string; status: string | null; subtype: string | null; refundAt: string | null; closedAt: string | null }>; messages: Array<{ senderRole: string | null; receiverRole: string | null; messageText: string | null; messageDate: string | null }>; assets: Array<{ externalId: string; originalFilename: string | null; mimeType: string | null; sizeBytes: number | null; createdAt: string | null }>; timeline: Array<{ type: string; at: string; source: string; summary: string }>; missingEvidence: string[] }
type DefenseAnalysis = { summary: string; riskExplanation: string; keyFacts: Array<{ text: string; sourceRefs: string[] }>; inconsistencies: Array<{ text: string; sourceRefs: string[] }>; evidenceSuggestions: string[]; recommendedResponse: string; confidence: number }
export type SyncResult = { jobId: string; status: 'SUCCESS' | 'PARTIAL' | 'FAILED'; products: number; orders: number; claims: number; returns: number; created: number; updated: number; failed: number; startedAt: string; finishedAt: string }

const reasonLabels: Record<string, string> = {
  high_financial_exposure: 'Exposição financeira alta',
  deadline_overdue: 'Prazo vencido',
  deadline_within_24h: 'Prazo em até 24 horas',
  deadline_within_72h: 'Prazo em até 72 horas',
  deadline_missing: 'Prazo não informado',
  return_in_progress: 'Devolução em andamento',
  amount_unknown: 'Valor não disponível',
  currency_not_scored: 'Moeda não pontuada',
}

function formatMoney(amount: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount)
}

export function syncOutcomeMessage(result: Pick<SyncResult, 'status' | 'products' | 'orders'>): string | null {
  if (result.status === 'SUCCESS' && result.products === 0 && result.orders === 0) return 'Sincronização concluída. Nenhum anúncio ou pedido foi encontrado nesta conta.'
  if (result.status === 'PARTIAL') return 'Sincronização concluída parcialmente.'
  if (result.status === 'FAILED') return 'Não foi possível concluir a sincronização.'
  return null
}

export function returnShieldEmptyMessage(openCases: number): string | null {
  return openCases === 0 ? 'Nenhum caso em risco encontrado.' : null
}

const sessionEndpoint = '/api/auth/session'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState('')
  const [syncOutcome, setSyncOutcome] = useState('')
  const [evidencePack, setEvidencePack] = useState<EvidencePack | null>(null)
  const [evidenceError, setEvidenceError] = useState('')
  const [evidenceSyncing, setEvidenceSyncing] = useState(false)
  const [defenseAnalysis, setDefenseAnalysis] = useState<DefenseAnalysis | null>(null)
  const [defenseLoading, setDefenseLoading] = useState(false)
  const [defenseError, setDefenseError] = useState('')

  async function restoreSession() {
    const response = await fetch(sessionEndpoint, { credentials: 'include' })
    const nextSession = await response.json() as Session
    setSession(nextSession)
    return nextSession
  }

  async function loadIntegration() {
    const response = await fetch('/api/integrations/mercadolivre/status', { credentials: 'include' })
    if (!response.ok) return
    const nextIntegration = await response.json() as Integration
    setIntegration(nextIntegration)
    if (new URLSearchParams(window.location.search).get('mercadolivre') === 'connected') {
      if (nextIntegration.connected) setNotice('Mercado Livre conectado')
      const url = new URL(window.location.href)
      url.searchParams.delete('mercadolivre')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }

  async function loadDashboard() {
    const response = await fetch('/api/returnshield/dashboard', { credentials: 'include' })
    if (!response.ok) return
    setDashboard(await response.json() as Dashboard)
  }

  useEffect(() => {
    void restoreSession().catch(() => setSession({ authenticated: false }))
  }, [])

  useEffect(() => {
    if (session?.authenticated) {
      void loadIntegration().catch(() => setIntegration(null))
      void loadDashboard().catch(() => setDashboard(null))
    } else {
      setIntegration(null)
      setDashboard(null)
    }
  }, [session?.authenticated])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setLoginError('')
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) throw new Error('Login failed')
      const nextSession = await response.json() as Session
      setSession({ authenticated: true, user: nextSession.user, workspaceId: nextSession.workspaceId })
      setPassword('')
    } catch {
      setLoginError('Não foi possível entrar. Confira seus dados e tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setSession({ authenticated: false })
    setNotice('')
    setSyncResult(null)
    setSyncError('')
    setSyncOutcome('')
    setDashboard(null)
    setEvidencePack(null)
    setEvidenceError('')
    setDefenseAnalysis(null)
    setDefenseError('')
  }

  async function syncMercadoLivre() {
    setSyncing(true)
    setSyncError('')
    setSyncOutcome('')
    try {
      const response = await fetch('/api/integrations/mercadolivre/sync', { method: 'POST', credentials: 'include' })
      if (!response.ok) throw new Error('Sync failed')
      const result = await response.json() as SyncResult
      setSyncResult(result)
      setSyncOutcome(syncOutcomeMessage(result) ?? '')
      await loadIntegration()
      await loadDashboard()
    } catch {
      setSyncError('Não foi possível concluir a sincronização.')
    } finally {
      setSyncing(false)
    }
  }

  async function openEvidence(externalClaimId: string) {
    setEvidenceError('')
    setEvidencePack(null)
    try {
      const response = await fetch(`/api/returnshield/cases/${encodeURIComponent(externalClaimId)}/evidence-pack`, { credentials: 'include' })
      if (!response.ok) throw new Error('Evidence pack failed')
      setEvidencePack(await response.json() as EvidencePack)
    } catch {
      setEvidenceError('Não foi possível carregar as evidências deste caso.')
    }
  }

  async function analyzeDefense() {
    if (!evidencePack) return
    setDefenseLoading(true); setDefenseError('')
    try {
      const response = await fetch(`/api/returnshield/cases/${encodeURIComponent(evidencePack.externalClaimId)}/defense-analysis`, { method: 'POST', credentials: 'include' })
      if (!response.ok) throw new Error('Defense analysis failed')
      const body = await response.json() as { analysis: DefenseAnalysis | null }
      setDefenseAnalysis(body.analysis)
    } catch { setDefenseError('Copiloto temporariamente indisponível.') } finally { setDefenseLoading(false) }
  }

  async function syncEvidence() {
    if (!evidencePack) return
    setEvidenceSyncing(true)
    setEvidenceError('')
    try {
      const response = await fetch(`/api/returnshield/cases/${encodeURIComponent(evidencePack.externalClaimId)}/evidence/sync`, { method: 'POST', credentials: 'include' })
      if (!response.ok) throw new Error('Evidence sync failed')
      await openEvidence(evidencePack.externalClaimId)
    } catch {
      setEvidenceError('Não foi possível atualizar as evidências.')
    } finally {
      setEvidenceSyncing(false)
    }
  }

  if (!session) return <main className="shell"><p className="loading">Carregando SellerOS…</p></main>

  if (!session.authenticated || !session.user || !session.workspaceId) {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card" aria-labelledby="title">
          <span className="eyebrow">SELLEROS</span>
          <h1 id="title">Entrar</h1>
          <form onSubmit={login}>
            <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
            {loginError && <p className="error" role="alert">{loginError}</p>}
            <button type="submit" disabled={submitting}>{submitting ? 'Entrando…' : 'Entrar'}</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="shell app-shell">
      <header className="app-header">
        <div><span className="eyebrow">SELLEROS</span><p>{session.user.email}</p></div>
        <button className="secondary" onClick={() => void logout()}>Sair</button>
      </header>
      <section className="returnshield" aria-labelledby="returnshield-title">
        <span className="eyebrow">RETURNSHIELD</span>
        <h1 id="returnshield-title">Dinheiro em risco</h1>
        {dashboard ? (
          <>
            <div className="risk-grid">
              <article className="risk-card primary"><span>Exposição estimada</span><strong>{formatMoney(dashboard.moneyAtRisk.estimatedAmount)}</strong><small>Money at Risk é uma estimativa interna do SellerOS baseada nos dados disponíveis.</small></article>
              <article className="risk-card"><strong>{dashboard.openCases}</strong><span>casos abertos</span></article>
              <article className="risk-card"><strong>{dashboard.criticalCases}</strong><span>críticos</span></article>
              <article className="risk-card"><strong>{dashboard.overdueCases}</strong><span>vencidos</span></article>
              <article className="risk-card"><strong>{dashboard.dueToday}</strong><span>vencendo hoje</span></article>
            </div>
            <div className="priority-header"><h2>Casos prioritários</h2><span>{dashboard.casesWithReturns} com devolução</span></div>
            {returnShieldEmptyMessage(dashboard.openCases) ? <p className="empty-state">{returnShieldEmptyMessage(dashboard.openCases)}</p> : <div className="priority-list">{dashboard.priorityCases.map((riskCase) => (
              <article className="priority-case" key={riskCase.externalClaimId}>
                <div><strong>#{riskCase.externalClaimId}</strong>{riskCase.title && <p>{riskCase.title}</p>}</div>
                <span className={`severity ${riskCase.severity.toLowerCase()}`}>{riskCase.severity}</span>
                <p>{riskCase.amountKnown && riskCase.estimatedExposure !== null ? `Exposição estimada: ${formatMoney(riskCase.estimatedExposure, riskCase.currencyId ?? 'BRL')}` : 'Exposição estimada indisponível'}</p>
                <p>Risk Score: {riskCase.riskScore}</p>
                <p>{riskCase.overdue ? 'Prazo vencido' : riskCase.deadlineAt ? `Prazo: ${new Date(riskCase.deadlineAt).toLocaleString()}` : 'Prazo não informado'}</p>
                {riskCase.reasons.length > 0 && <p className="reasons">{riskCase.reasons.map((reason) => reasonLabels[reason] ?? reason).join(' · ')}</p>}
                <button className="secondary evidence-button" onClick={() => void openEvidence(riskCase.externalClaimId)}>Ver evidências</button>
              </article>
            ))}</div>}
            {evidenceError && <p className="error" role="alert">{evidenceError}</p>}
            {evidencePack && <section className="evidence-pack" aria-labelledby="evidence-title">
              <div className="priority-header"><h2 id="evidence-title">Evidências #{evidencePack.externalClaimId}</h2><button onClick={() => void syncEvidence()} disabled={evidenceSyncing}>{evidenceSyncing ? 'Atualizando…' : 'Atualizar evidências'}</button></div>
              <div className="evidence-grid">
                <article><h3>Resumo do caso</h3><p>{evidencePack.claim.title ?? 'Sem título'}</p><p>Status: {evidencePack.claim.status ?? 'Não informado'}</p><p>Prazo: {evidencePack.claim.dueDate ? new Date(evidencePack.claim.dueDate).toLocaleString() : 'Não informado'}</p></article>
                <article><h3>Pedido</h3>{evidencePack.order ? <><p>#{evidencePack.order.externalOrderId}</p><p>{evidencePack.order.paidAmount ?? evidencePack.order.totalAmount ?? 'Valor não informado'}</p></> : <p>Pedido não vinculado.</p>}</article>
                <article><h3>Itens</h3>{evidencePack.items.length ? evidencePack.items.map((item) => <p key={item.externalItemId}>{item.quantity} × {item.title ?? item.externalItemId}</p>) : <p>Nenhum item disponível.</p>}</article>
                <article><h3>Timeline</h3>{evidencePack.timeline.length ? evidencePack.timeline.map((event) => <p key={`${event.type}-${event.at}`}>{event.summary} — {new Date(event.at).toLocaleString()}</p>) : <p>Nenhum evento disponível.</p>}</article>
                <article><h3>Mensagens</h3>{evidencePack.messages.length ? evidencePack.messages.map((message, index) => <p key={`${message.messageDate}-${index}`}>{message.messageText ?? 'Mensagem sem texto'}</p>) : <p>Nenhuma mensagem sincronizada.</p>}</article>
                <article><h3>Anexos</h3>{evidencePack.assets.length ? evidencePack.assets.map((asset) => <p key={asset.externalId}>{asset.originalFilename ?? asset.externalId} <a href={`/api/returnshield/cases/${encodeURIComponent(evidencePack.externalClaimId)}/assets/${encodeURIComponent(asset.externalId)}/download`}>Baixar</a></p>) : <p>Nenhum anexo sincronizado.</p>}</article>
                <article><h3>Informações ausentes</h3>{evidencePack.missingEvidence.length ? evidencePack.missingEvidence.map((item) => <p key={item}>{item}</p>) : <p>Nenhuma informação ausente identificada.</p>}</article>
              </div>
              <section className="defense-copilot"><h3>Defense Copilot</h3><p>A IA analisa somente os dados disponíveis no Evidence Pack. Nenhuma ação é enviada ao Mercado Livre.</p><button onClick={() => void analyzeDefense()} disabled={defenseLoading}>{defenseLoading ? 'Analisando…' : 'Analisar com IA'}</button>{defenseError && <p className="error" role="alert">{defenseError}</p>}{defenseAnalysis && <div className="evidence-grid"><article><h3>Resumo</h3><p>{defenseAnalysis.summary}</p><h3>Por que este caso merece atenção</h3><p>{defenseAnalysis.riskExplanation}</p></article><article><h3>Fatos utilizados</h3>{defenseAnalysis.keyFacts.map((item, index) => <p key={index}>{item.text}</p>)}<h3>Inconsistências</h3>{defenseAnalysis.inconsistencies.map((item, index) => <p key={index}>{item.text}</p>)}</article><article><h3>Evidências que vale revisar</h3>{defenseAnalysis.evidenceSuggestions.map((item, index) => <p key={index}>{item}</p>)}</article><article><h3>Resposta sugerida</h3><p>{defenseAnalysis.recommendedResponse}</p><button className="secondary" onClick={() => void navigator.clipboard?.writeText(defenseAnalysis.recommendedResponse)}>Copiar resposta</button><p>Confiança da análise: {defenseAnalysis.confidence}/100</p></article></div>}</section>
            </section>}
          </>
        ) : <p className="loading">Carregando ReturnShield…</p>}
      </section>
      <section className="card integration-card" aria-labelledby="integration-title">
        <span className="eyebrow">INTEGRAÇÕES</span>
        <h1 id="integration-title">Mercado Livre</h1>
        {integration?.connected ? (
          <>
            <div className="status connected" role="status"><span className="dot" /> Mercado Livre conectado{integration.externalAccountId && <small>Conta: {integration.externalAccountId}</small>}</div>
            <button onClick={() => void syncMercadoLivre()} disabled={syncing}>{syncing ? 'Sincronizando...' : 'Sincronizar dados'}</button>
            {syncError && <p className="error" role="alert">{syncError}</p>}
            {syncOutcome && <p className="notice" role="status">{syncOutcome}</p>}
            {syncResult && <div className="sync-summary" role="status"><span>Produtos: {syncResult.products}</span><span>Pedidos: {syncResult.orders}</span><span>Reclamações: {syncResult.claims}</span><span>Devoluções: {syncResult.returns}</span><span>Criados: {syncResult.created}</span><span>Atualizados: {syncResult.updated}</span><span>Última sincronização: {new Date(syncResult.finishedAt).toLocaleString()}</span></div>}
            {!syncResult && integration.lastSyncAt && <p className="sync-summary">Última sincronização: {new Date(integration.lastSyncAt).toLocaleString()}</p>}
          </>
        ) : (
          <div className="status" role="status"><span className="dot muted" /> Mercado Livre desconectado</div>
        )}
        {notice && <p className="notice" role="status">{notice}</p>}
        {!integration?.connected && <button onClick={() => window.location.assign('/api/integrations/mercadolivre/connect')}>Conectar Mercado Livre</button>}
      </section>
    </main>
  )
}
