export function App() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="title">
        <span className="eyebrow">SELLEROS / FOUNDATION</span>
        <h1 id="title">Commerce control, começando pelo essencial.</h1>
        <p className="lead">A fundação de autenticação e workspace está pronta para receber o ReturnShield.</p>
        <div className="status" role="status">
          <span className="dot" /> Fase 1 — fundação ativa
        </div>
      </section>
      <section className="card" aria-label="Próximos limites">
        <h2>Escopo atual</h2>
        <p>React + TypeScript + Vite no frontend, Cloudflare Worker + D1 no backend e isolamento por workspace.</p>
        <small>Mercado Livre permanece fora desta fase.</small>
      </section>
    </main>
  )
}
