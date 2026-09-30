import { FormEvent, useEffect, useState } from 'react'

type Session = { authenticated: boolean; user?: { id: string; email: string }; workspaceId?: string }
type Integration = { connected: boolean; externalAccountId: string | null }

const sessionEndpoint = '/api/auth/session'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  useEffect(() => {
    void restoreSession().catch(() => setSession({ authenticated: false }))
  }, [])

  useEffect(() => {
    if (session?.authenticated) void loadIntegration().catch(() => setIntegration(null))
    else setIntegration(null)
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
      <section className="card integration-card" aria-labelledby="integration-title">
        <span className="eyebrow">INTEGRAÇÕES</span>
        <h1 id="integration-title">Mercado Livre</h1>
        {integration?.connected ? (
          <div className="status connected" role="status"><span className="dot" /> Mercado Livre conectado{integration.externalAccountId && <small>Conta: {integration.externalAccountId}</small>}</div>
        ) : (
          <div className="status" role="status"><span className="dot muted" /> Mercado Livre desconectado</div>
        )}
        {notice && <p className="notice" role="status">{notice}</p>}
        {!integration?.connected && <button onClick={() => window.location.assign('/api/integrations/mercadolivre/connect')}>Conectar Mercado Livre</button>}
      </section>
    </main>
  )
}
