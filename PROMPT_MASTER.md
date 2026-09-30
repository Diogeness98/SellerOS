# PROMPT MESTRE — SELLEROS COMMERCE CONTROL PLANE
## CONSTRUÇÃO ULTRAECONÔMICA, INCREMENTAL, ORIENTADA A VALIDAÇÃO E PRODUÇÃO

Você atuará simultaneamente como:

- Principal Software Engineer
- SaaS Architect
- Product Engineer
- Backend Engineer
- Frontend Engineer
- Database Engineer
- AI Engineer
- Security Engineer
- QA Engineer
- DevOps Engineer
- Product Manager técnico

Sua missão NÃO é rediscutir o produto.

Sua missão é:

> **construir o SellerOS com o menor custo possível de infraestrutura, tokens, horas de agente, chamadas de IA e retrabalho, entregando primeiro um MVP comercial extremamente enxuto chamado ReturnShield.**

O sistema completo poderá futuramente evoluir para:

# SellerOS Commerce Control Plane

Porém:

> **NÃO CONSTRUA O SELLEROS COMPLETO AGORA.**

A primeira meta comercial é provar o ReturnShield com usuários reais.

---

# 0. REGRA MÁXIMA

Considere este documento como a especificação principal.

Não volte a perguntar:

- qual stack utilizar;
- qual banco utilizar;
- qual backend utilizar;
- onde hospedar;
- qual produto construir primeiro;
- quais módulos desenvolver;
- qual marketplace começar;
- qual arquitetura utilizar;
- qual MVP desenvolver;
- qual infraestrutura contratar.

Essas decisões estão definidas.

---

# 1. ESTRATÉGIA PRINCIPAL

A estratégia obrigatória é:

```text
CONSTRUIR POUCO
↓
PUBLICAR
↓
TESTAR COM SELLERS REAIS
↓
MEDIR VALOR
↓
CORRIGIR
↓
SÓ ENTÃO EXPANDIR
```

Não construir antecipadamente recursos que ainda não foram validados.

---

# 2. FERRAMENTAS DE CONSTRUÇÃO

Prioridade:

```text
ChatGPT Work / Codex
        ↓
      GitHub
        ↓
Cloudflare
```

Pode utilizar outro agente de programação se necessário, mas o projeto não deve ficar preso a uma plataforma proprietária de geração de sites.

---

# 3. LOVABLE

Lovable poderá ser utilizado SOMENTE quando trouxer economia real para:

- prototipar UI;
- experimentar dashboard;
- landing page;
- onboarding;
- componentes visuais.

Não utilizar Lovable como dependência central de:

- backend;
- banco;
- regras financeiras;
- autenticação;
- integrações;
- engines;
- agentes.

O código de produção deve permanecer controlável através do GitHub.

---

# 4. INFRAESTRUTURA PADRÃO

Usar prioritariamente:

## Frontend

```text
React
TypeScript
Vite
```

## Backend

```text
Cloudflare Workers
TypeScript
```

## Banco

```text
Cloudflare D1
```

## Arquivos

```text
Cloudflare R2
```

Usar principalmente para:

- fotos;
- documentos;
- evidências;
- anexos.

## Filas

```text
Cloudflare Queues
```

Somente quando sincronizações assíncronas realmente exigirem.

## Tarefas agendadas

```text
Cloudflare Cron
```

Somente quando necessário.

---

# 5. REGRA DE CUSTO DE INFRAESTRUTURA

Enquanto o MVP suportar o tier gratuito:

> permaneça nele.

Não migrar antecipadamente para infraestrutura paga apenas por previsão de escala.

Somente subir de plano quando:

- limite real estiver próximo;
- desempenho justificar;
- volume justificar;
- cliente justificar.

---

# 6. O QUE NÃO UTILIZAR SEM NECESSIDADE

Não introduzir:

```text
AWS
Kubernetes
Docker Swarm
Kafka
Redis gerenciado
Elasticsearch
GraphQL
microservices
Firebase
banco duplicado
backend duplicado
servidor VPS permanente
```

a menos que exista um bloqueio técnico comprovado.

---

# 7. ARQUITETURA

Manter arquitetura simples:

```text
apps/
  web/

worker/
  routes/
  middleware/
  modules/
  integrations/
  engines/
  ai/
  agents/
  policies/
  db/
  services/
  utils/

shared/
  schemas/
  types/
  constants/

migrations/

tests/
```

Evitar complexidade de monorepo desnecessária.

---

# 8. REGRA DE ECONOMIA DE HORAS E TOKENS

Antes de fazer qualquer alteração:

1. localizar a implementação atual;
2. entender somente o necessário;
3. modificar a menor quantidade de código possível;
4. testar;
5. continuar.

Não faça:

- releitura completa constante;
- análises gigantes;
- refatorações cosméticas;
- documentação redundante;
- criação de arquivos inúteis;
- reconstrução de funcionalidades existentes.

Prefira:

```text
50 linhas alteradas corretamente
```

em vez de:

```text
500 linhas reescritas.
```

---

# 9. PROJECT_STATE.MD

Este arquivo é obrigatório.

Ele será a memória técnica econômica do projeto.

Manter:

```md
# SellerOS Project State

## Current Phase
Phase X

## Status
PASS / FAIL / IN PROGRESS

## Stack
...

## Implemented
- ...

## Database
Latest migration: ...

## Relevant Routes
- ...

## Tests
X PASS
Y FAIL

## Current Blockers
- ...

## Next Exact Task
...
```

Não escrever documentação excessiva.

---

# 10. NOVAS SESSÕES

Uma nova IA/agente deverá começar lendo:

```text
PROJECT_STATE.md
```

e depois apenas os arquivos relacionados diretamente à tarefa.

Não reler o projeto inteiro automaticamente.

---

# 11. PRODUTO

Nome:

# SellerOS

Visão futura:

# SellerOS Commerce Control Plane

Objetivo final:

```text
DETECT
↓
PROTECT
↓
RECOVER
↓
OPTIMIZE
↓
RECOMMEND
↓
EXECUTE
↓
GOVERN
```

---

# 12. MAS O MVP NÃO É O SELLEROS COMPLETO

Produto inicial:

# ReturnShield

A primeira versão comercial deve responder:

> Quanto dinheiro tenho em risco devido a reclamações/devoluções e quais casos devo atacar primeiro?

---

# 13. REGRA ABSOLUTA DE MVP

ANTES de construir:

- Profit Leak completo;
- Fee Guard;
- Reputation Guard;
- Catalog Doctor;
- Competitor Intelligence;
- Shopee;
- TikTok;
- agentes de execução;

é obrigatório chegar ao seguinte MVP:

```text
Login
↓
Workspace
↓
Mercado Livre OAuth
↓
Produtos
↓
Pedidos
↓
Claims / Returns
↓
Money at Risk
↓
Risk Score
↓
ReturnShield Dashboard
↓
Evidence Pack
↓
Defense Copilot
↓
Deploy
```

---

# 14. STOP GATE

Quando esse MVP estiver funcionando:

# PARE A EXPANSÃO.

Não implemente automaticamente os módulos seguintes.

Primeiro gerar:

```text
MVP_READY_FOR_REAL_VALIDATION
```

Apresentar:

- URL funcional;
- testes;
- funcionalidades;
- limitações;
- métricas a observar.

O próximo objetivo será colocar sellers reais utilizando.

---

# 15. VALIDAÇÃO REAL

Medir:

```text
quantos sellers conectaram

quantas reclamações foram detectadas

quanto Money at Risk foi identificado

quantas recomendações foram úteis

quantas defesas foram utilizadas

quanto valor foi recuperado

quanto tempo foi economizado

quais funções foram realmente utilizadas
```

---

# 16. CONDIÇÃO PARA EXPANDIR

Somente continuar automaticamente para módulos posteriores quando explicitamente autorizado OU quando a especificação de execução informar que a validação já ocorreu.

Não construir 16 fases antecipadamente.

---

# 17. PRIMEIRO MARKETPLACE

Começar exclusivamente com:

# Mercado Livre

Arquitetura preparada para outros canais via adapters.

---

# 18. CHANNEL ADAPTER

Usar interface aproximadamente assim:

```ts
interface CommerceChannelAdapter {
  connect(): Promise<void>
  refreshAuth(): Promise<void>

  syncProducts(): Promise<SyncResult>
  syncOrders(): Promise<SyncResult>
  syncClaims(): Promise<SyncResult>
  syncReturns(): Promise<SyncResult>
  syncFees?(): Promise<SyncResult>
  syncReputation?(): Promise<SyncResult>

  updatePrice?(input: UpdatePriceInput): Promise<ActionResult>
  updateStock?(input: UpdateStockInput): Promise<ActionResult>
  updateListing?(input: UpdateListingInput): Promise<ActionResult>
  sendMessage?(input: SendMessageInput): Promise<ActionResult>
}
```

Primeiro:

```text
MercadoLivreAdapter
```

Futuramente:

```text
ShopeeAdapter
TikTokShopAdapter
ShopifyAdapter
WooCommerceAdapter
NuvemshopAdapter
```

---

# 19. NÃO DUPLICAR CORE

Regras como:

- lucro;
- risco;
- recomendações;
- políticas;
- agentes;

não podem depender diretamente de Mercado Livre.

Marketplace é um adapter.

SellerOS é o core.

---

# 20. MULTITENANCY

Estrutura:

```text
user
↓
workspace
↓
workspace_members
↓
integrations
↓
commerce data
```

Todas as tabelas comerciais devem possuir:

```text
workspace_id
```

---

# 21. AUTENTICAÇÃO

Implementar autenticação real.

Papéis:

```text
OWNER
ADMIN
MANAGER
OPERATOR
VIEWER
```

Backend deve validar permissões.

---

# 22. BANCO INICIAL DO MVP

NÃO criar todas as tabelas futuras no primeiro momento.

Criar somente o necessário:

```text
users

workspaces

workspace_members

integrations

products

product_variants

orders

order_items

claims

returns

customer_messages

evidence_assets

claim_evidence

sync_jobs

ai_cache

ai_usage

audit_logs

app_settings
```

Posteriormente adicionar:

```text
product_costs
fees
profit_snapshots
profit_alerts
reputation_snapshots
catalog_findings
competitor_snapshots
trend_signals
recommendations
action_previews
execution_actions
execution_policies
agent_permissions
```

Não antecipar schema desnecessário.

---

# 23. PADRÃO DAS TABELAS

Quando aplicável:

```text
id
workspace_id
created_at
updated_at
```

Dados externos:

```text
channel
external_id
external_created_at
external_updated_at
raw_hash
last_synced_at
```

---

# 24. ÍNDICES

Criar somente índices úteis.

Priorizar:

```text
workspace_id
channel
external_id
status
created_at
```

Adicionar UNIQUE quando necessário para impedir duplicação.

---

# 25. INTEGRATIONS

Tabela:

```text
integrations

id
workspace_id
channel
status

external_account_id

access_token_encrypted
refresh_token_encrypted

token_expires_at

scopes

last_sync_at

created_at
updated_at
```

Tokens:

- backend somente;
- nunca frontend;
- nunca logs.

---

# 26. MERCADO LIVRE OAUTH

Rotas:

```text
/api/integrations/mercadolivre/connect

/api/integrations/mercadolivre/callback

/api/integrations/mercadolivre/status

/api/integrations/mercadolivre/disconnect

/api/integrations/mercadolivre/sync
```

Implementar:

- OAuth state;
- CSRF protection;
- refresh;
- reconexão;
- tratamento de erro;
- armazenamento seguro.

Antes de implementar detalhes externos:

> consultar documentação oficial atual.

Não inventar endpoints ou scopes.

---

# 27. SINCRONIZAÇÃO

Criar:

```text
SyncService
```

Estados:

```text
PENDING
RUNNING
SUCCESS
PARTIAL
FAILED
```

Guardar:

```text
started_at
finished_at
records_seen
records_created
records_updated
records_failed
error_summary
```

---

# 28. SYNC MVP

Inicialmente sincronizar somente:

```text
products
orders
claims
returns
```

Não sincronizar absolutamente tudo da API apenas porque existe.

---

# 29. IDEMPOTÊNCIA

Sync deve ser:

```text
incremental
idempotente
repetível
```

Executar novamente não pode duplicar dados.

---

# 30. RETURNSHIELD

Objetivo:

priorizar dinheiro em risco.

Responder:

```text
Quanto dinheiro está em risco?

Quais casos são críticos?

Quais vencem primeiro?

Quais evidências existem?

Quais evidências estão faltando?

Qual defesa é sugerida?
```

---

# 31. RETURNSHIELD DASHBOARD

Mostrar:

```text
Money at Risk

Casos abertos

Casos críticos

Casos vencendo hoje

Casos sem evidências

Valor potencialmente recuperável

Valor recuperado confirmado
```

---

# 32. MONEY AT RISK

Métrica interna.

Não afirmar que é métrica oficial do marketplace.

Estrutura:

```ts
type RiskCase = {
  claimId: string
  orderId: string

  grossAmount: number
  estimatedExposure: number

  deadlineAt?: string

  financialRisk: number
  reputationRisk?: number
  urgencyRisk: number

  riskScore: number

  status: string
}
```

---

# 33. RISK ENGINE

O Risk Score é calculado por código.

Não usar LLM.

Exemplo:

```text
financialWeight
+
deadlineWeight
+
evidenceGapWeight
+
reputationWeight
=
riskScore
```

Faixa:

```text
0–100
```

Categorias:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

---

# 34. EVIDENCE PACK

Criar:

```text
EvidencePackService
```

Reunir automaticamente:

```text
pedido
produto
SKU
variante
datas
tracking
mensagens
descrição
atributos
fotos
documentos
peso
histórico
eventos
```

---

# 35. MODELO DE EVIDENCE PACK

```ts
type EvidencePack = {
  claimId: string

  order: {}
  product: {}
  logistics: {}

  messages: []
  assets: []
  timeline: []

  missingEvidence: []

  confidence: number
}
```

---

# 36. DEFENSE COPILOT

A IA pode:

```text
resumir caso

organizar timeline

encontrar inconsistências textuais

apontar evidências

apontar ausência de evidência

gerar resposta sugerida

gerar rascunho de defesa
```

Não pode inventar fatos.

---

# 37. SOURCE OF TRUTH

Toda informação factual da defesa deve vir de:

```text
Evidence Pack
```

Não da memória da IA.

---

# 38. USO DE IA

A arquitetura obrigatória é:

```text
DADOS BRUTOS
↓
SQL + TypeScript
↓
ENGINE DETERMINÍSTICO
↓
RESUMO ESTRUTURADO
↓
IA
```

Nunca:

```text
milhares de registros
↓
LLM
```

---

# 39. REGRA IA

Use IA como:

```text
INTERPRETER
COPILOT
GENERATOR
```

Não como:

```text
DATABASE
CALCULATOR
ACCOUNTING ENGINE
PERMISSION ENGINE
SOURCE OF TRUTH
```

---

# 40. AI PROVIDER

Criar abstração:

```ts
interface AIProvider {
  generateStructured<T>(
    input: AIRequest,
    schema: unknown
  ): Promise<T>
}
```

O core não pode depender diretamente de um modelo específico.

---

# 41. MODEL ROUTER

Criar estratégia de roteamento.

```text
SQL/regra/cálculo
→ sem IA

classificação simples
→ modelo econômico

resumo simples
→ modelo econômico

defesa complexa
→ modelo mais capaz
```

Nunca usar o modelo mais caro automaticamente.

---

# 42. AI USAGE TRACKING

Registrar:

```text
provider
model
purpose
input_hash
cache_hit
input_units
output_units
estimated_cost
latency
status
```

quando esses dados estiverem disponíveis.

---

# 43. AI CACHE

Antes de chamar IA:

```text
hash(
 prompt_version
 + structured_input
)
```

Se não mudou:

```text
usar cache.
```

---

# 44. PROMPT VERSIONING

Todo prompt interno possui:

```text
prompt_name
prompt_version
```

---

# 45. STRUCTURED OUTPUT

Sempre pedir JSON/schema quando possível.

Exemplo:

```json
{
  "summary": "",
  "riskFactors": [],
  "missingEvidence": [],
  "recommendedResponse": "",
  "confidence": 0
}
```

Validar.

Uma tentativa de reparo no máximo.

Evitar loops de IA.

---

# 46. AI FAILURE

Se OpenAI estiver indisponível:

ReturnShield continua funcionando.

Devem funcionar sem LLM:

```text
sync
dashboard
claims
returns
risk
money at risk
evidence listing
deadlines
priorities
```

IA é enriquecimento.

---

# 47. PRIMEIRA HOME

Priorizar:

```text
DINHEIRO EM RISCO
R$ X

X casos críticos
X vencendo hoje
X sem evidência

CASOS PRIORITÁRIOS

#CLAIM
R$ X em risco
Vence em X
[Analisar]
```

Evitar dashboards cheios de gráficos sem função.

---

# 48. WOW MOMENT

O primeiro momento de valor deve ser:

> Encontramos R$ X potencialmente em risco.

> X casos precisam de atenção.

> X vencem hoje.

Botão:

```text
Ver casos prioritários
```

---

# 49. UI

Características:

```text
limpa
rápida
profissional
responsiva
desktop-first operacional
mobile funcional
```

Prioridade visual:

```text
o que aconteceu

quanto dinheiro envolve

qual urgência

por quê

o que fazer
```

---

# 50. SEGURANÇA MVP

Obrigatório:

```text
workspace isolation
backend authorization
token encryption
input validation
secure sessions
rate limiting básico
idempotency
audit
secret management
```

---

# 51. AUDITORIA

Campos:

```text
workspace_id

actor_type
actor_id

action

entity_type
entity_id

before_json
after_json

source

created_at
```

Actors:

```text
USER
SYSTEM
SYNC
AI
WEBHOOK
```

---

# 52. TESTES MVP

Priorizar:

```text
unit
↓
integration
↓
E2E somente crítico
```

---

# 53. TESTES DE WORKSPACE

Obrigatório testar:

```text
workspace A
```

não consegue acessar:

```text
workspace B
```

---

# 54. TESTES DE SYNC

Cobrir:

```text
first sync

repeat sync

update existing record

partial failure

token expiration

duplicate external ID
```

---

# 55. TESTES DO RISK ENGINE

Cobrir:

```text
low value case

high value case

deadline imminent

deadline missing

missing evidence

closed case

multiple risk factors
```

---

# 56. BUILD GATE

Nenhuma fase pode ser PASS com:

```text
TypeScript error
broken build
critical test failure
missing migration
```

---

# 57. FASE 0 — AUDITORIA

Verificar rapidamente:

```text
stack
banco
auth
rotas
migrations
tests
deploy
```

Criar/atualizar:

```text
PROJECT_STATE.md
```

Depois avançar.

---

# 58. FASE 1 — FUNDAÇÃO

Implementar:

```text
auth
users
workspaces
workspace_members
RBAC
middleware
API errors
audit foundation
```

Gate:

```text
login funciona

workspace funciona

isolamento funciona
```

---

# 59. FASE 2 — MERCADO LIVRE CONNECT

Implementar:

```text
OAuth

integration storage

status

disconnect

token management
```

Gate:

```text
conta ML conecta realmente
```

Não marcar PASS apenas com mock.

---

# 60. FASE 3 — SYNC BÁSICO

Sincronizar:

```text
products
orders
```

Gate:

```text
dados reais
sem duplicidade
sync repetível
```

---

# 61. FASE 4 — CLAIMS + RETURNS

Sincronizar:

```text
claims
returns
```

Normalizar dados para o core.

---

# 62. FASE 5 — RETURNSHIELD CORE

Construir:

```text
Money at Risk
Risk Score
deadlines
prioritization
dashboard
```

Gate:

usuário consegue responder:

```text
quanto dinheiro está em risco?

qual caso atacar primeiro?
```

---

# 63. FASE 6 — EVIDENCE PACK

Construir:

```text
evidence aggregation

timeline

missing evidence

attachments
```

---

# 64. FASE 7 — DEFENSE COPILOT

Adicionar:

```text
AI summary

risk explanation

draft response
```

Ainda:

```text
READ + RECOMMEND
```

Não executar ações automaticamente.

---

# 65. FASE 8 — DEPLOY MVP

Publicar o MVP.

Executar:

```text
build
typecheck
tests
migration
production smoke test
```

---

# 66. MVP PASS

Somente declarar MVP PASS quando existir:

```text
Login

Workspace

Mercado Livre OAuth real

Produtos reais

Pedidos reais

Claims/Returns reais quando disponíveis

Money at Risk

Risk Score

Evidence Pack

Defense Copilot

Audit

Deploy funcional
```

---

# 67. PARADA OBRIGATÓRIA

Após o MVP:

```text
STOP_BUILDING_FEATURES
```

Produzir relatório curto:

```text
MVP READY

URL:
...

Tests:
...

Features:
...

Limitations:
...

Real validation metrics:
...
```

Não começar Profit Leak automaticamente.

---

# 68. FASE DE VALIDAÇÃO

Objetivo:

testar com sellers reais.

Perguntas:

```text
O ReturnShield encontrou problemas reais?

Money at Risk fez sentido?

O seller entendeu o valor?

Evidence Pack ajudou?

A defesa poupou tempo?

Seller pagaria por isso?
```

---

# 69. VALIDAÇÃO POSITIVA

Se houver evidência de utilidade:

avançar para:

# Profit Engine

---

# 70. PROFIT ENGINE

Somente nessa etapa adicionar tabelas de custos.

Fórmula:

```text
Revenue
-
Marketplace Fees
-
Shipping
-
COGS
-
Taxes
-
Packaging
-
Ads
-
Other Costs
=
Profit
```

---

# 71. PROFIT ENGINE É DETERMINÍSTICO

Não chamar IA para:

```text
soma
subtração
margem
taxa
custo
lucro
```

---

# 72. PROFIT STATUS

```text
LOSS
CRITICAL
WARNING
HEALTHY
```

Limites configuráveis.

---

# 73. PROFIT LEAK

Detectar:

```text
venda no prejuízo

margem crítica

queda de margem

produto sem custo

taxas elevadas

frete excessivo

alto faturamento com pouco lucro
```

---

# 74. PRIMEIRA INTEGRAÇÃO DE VALOR

ReturnShield responde:

```text
Quanto posso perder?
```

Profit Leak responde:

```text
Onde já estou perdendo?
```

Essa combinação deve formar o núcleo comercial do SellerOS.

---

# 75. FEE GUARD

Implementar depois.

Detectar:

```text
fee increase
unexpected charge
shipping anomaly
fee anomaly
large fee impact
```

Não afirmar erro sem evidência.

Usar:

```text
ANOMALY
```

quando existir apenas suspeita.

---

# 76. REPUTATION GUARD

Implementar:

```text
snapshots
trend
claims
returns
cancellations
delays
```

Separar:

```text
correlation

confirmed cause

estimated risk
```

---

# 77. CATALOG DOCTOR

Depois.

Analisar:

```text
title
description
attributes
category
variations
consistency
```

Produzir:

```text
ANTES
vs
DEPOIS
```

---

# 78. NÃO ALTERAR CATÁLOGO DIRETAMENTE

Fluxo:

```text
finding
↓
suggestion
↓
preview
↓
confirmation
↓
execution
```

---

# 79. COMPETITOR INTELLIGENCE

Depois.

Dados:

```text
competitor
product
price
observed_at
price_change
relative_difference
```

Sempre cruzar com margem antes de recomendar mudança de preço.

---

# 80. SELLER COPILOT

Só após possuir dados estruturados suficientes.

Criar:

```ts
type SellerSummary = {
  revenue: number
  profit: number
  margin: number

  moneyAtRisk: number
  estimatedLeak: number

  openClaims: number
  criticalClaims: number

  recommendations: []
}
```

Enviar apenas resumo relevante para IA.

---

# 81. RECOMMENDATIONS

Criar futuramente uma entidade central:

```ts
type Recommendation = {
  id: string
  workspaceId: string

  sourceModule: string

  entityType: string
  entityId: string

  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"

  title: string
  explanation: string

  financialImpact?: number

  proposedAction?: {
    actionType: string
    payload: unknown
  }

  confidence?: number
}
```

---

# 82. SHOPEE

Não implementar no MVP inicial.

Quando Mercado Livre estiver estável:

```text
ShopeeAdapter
```

---

# 83. TIKTOK SHOP

Implementar depois.

Profit Engine deve futuramente permitir:

```text
profit by order

profit by product

profit by creator

profit by affiliate

profit by campaign

profit by live
```

quando dados existirem.

---

# 84. OPPORTUNITY INTELLIGENCE

Somente posteriormente.

Possíveis fontes:

```text
internal seller data

Mercado Livre

YouTube

BigQuery

Shopee

TikTok
```

---

# 85. EXECUTION AGENTS

Somente após os módulos analíticos terem valor comprovado.

Possíveis agentes:

```text
ReturnAgent

PricingAgent

CatalogAgent

ReputationAgent

InventoryAgent
```

---

# 86. AGENTES NÃO POSSUEM ACESSO TOTAL

Cada agente terá capabilities.

Exemplo:

```text
PricingAgent

CAN:

read price

simulate price

propose price

update price when authorized


CANNOT:

refund

delete account

change credentials

access another workspace
```

---

# 87. EXECUTION ACTION TYPES

Quando chegar esta fase:

```text
UPDATE_PRICE

UPDATE_STOCK

UPDATE_TITLE

UPDATE_DESCRIPTION

UPDATE_ATTRIBUTES

SEND_MESSAGE

ANSWER_CLAIM

PAUSE_LISTING

RESUME_LISTING

CREATE_PROMOTION
```

---

# 88. ACTION PREVIEW

Antes de qualquer execução:

```text
current state

proposed state

reason

expected impact

risk

requested_by
```

---

# 89. ACTION LIFECYCLE

```text
DRAFT

PENDING_APPROVAL

APPROVED

EXECUTING

SUCCESS
```

Possíveis:

```text
REJECTED

FAILED

CANCELLED

ROLLED_BACK
```

---

# 90. EXECUTION ENGINE

Pipeline:

```text
validate

authenticate

authorize

workspace check

agent permission

business policy

execution policy

preview

approval

execute

verify

audit
```

---

# 91. AUTOPILOT

Default:

```text
OFF
```

Somente ativar com:

```text
agent capability

+

explicit workspace policy

+

safe limits
```

---

# 92. AGENT FIREWALL

Validar:

```text
identity

workspace

role

agent

capability

action

resource

policy

limits

financial impact
```

---

# 93. HIGH-RISK ACTIONS

Sempre exigir aprovação humana.

Exemplos:

```text
refund

bulk delete

large pricing changes

account settings

credentials

disconnect integration
```

---

# 94. VALUE TRACKING

Criar progressivamente:

```text
Detected

Estimated

Avoided

Recovered

Confirmed
```

Nunca chamar valor estimado de valor recuperado.

---

# 95. MÉTRICAS FUTURAS

```text
money_at_risk

money_recovered

estimated_profit_leak

profit_recovered

claims_resolved

recommendations_created

recommendations_accepted

actions_executed

actions_failed

AI_calls

AI_cache_hit_rate
```

---

# 96. ONBOARDING MVP

```text
Criar conta
↓
Criar workspace
↓
Conectar Mercado Livre
↓
Sincronizar
↓
ReturnShield
↓
Primeiro insight
```

Não exigir configuração excessiva antes do primeiro valor.

---

# 97. FEATURE FLAGS

Usar quando necessário:

```text
returnShieldEnabled

profitLeakEnabled

feeGuardEnabled

catalogDoctorEnabled

executionEngineEnabled
```

---

# 98. APIs EXTERNAS

Se houver dúvida sobre:

```text
endpoint

scope

payload

webhook

permission

rate limit
```

consultar documentação oficial atual.

Não inventar.

---

# 99. MOCKS

Mocks são permitidos para teste.

Mas integração real só é:

```text
REAL_WORLD_VERIFIED
```

quando realmente testada.

Caso contrário:

```text
IMPLEMENTED
NOT_REAL_WORLD_VERIFIED
```

---

# 100. DEPLOY

Preferência:

```text
Cloudflare
```

Não criar Vercel + outro backend + outro banco se Cloudflare resolver adequadamente.

---

# 101. GITHUB

O GitHub deve ser fonte principal do código.

Commits devem representar marcos úteis.

Evitar commit por alteração trivial quando o agente puder agrupar logicamente.

---

# 102. BRANCHING

Manter simples.

Exemplo:

```text
main

feature/returnshield
```

Não criar processo enterprise desnecessário.

---

# 103. MIGRATIONS

Nunca alterar migration antiga já aplicada.

Sempre nova migration incremental.

---

# 104. ENV

Manter:

```text
.env.example
```

Nunca versionar secrets.

---

# 105. ERRO DE API

Formato:

```json
{
  "error": {
    "code": "SOME_ERROR",
    "message": "Mensagem legível",
    "requestId": "..."
  }
}
```

---

# 106. LOGS

Registrar:

```text
request_id

workspace_id

route

duration

status

error_code
```

Não registrar secrets.

---

# 107. LGPD

Preparar para:

```text
disconnect integration

delete workspace

data export

data deletion

data minimization
```

Sem implementar burocracia excessiva antes do necessário.

---

# 108. REGRA DE ESCOPO

Antes de qualquer nova feature perguntar internamente:

> Isso é necessário para atingir o próximo PASS?

Se não:

```text
BACKLOG.
```

---

# 109. REGRA DE ERRO

Quando ocorrer:

```text
erro
↓
identificar causa
↓
inspeção mínima
↓
correção
↓
teste
```

Não tentar alterações aleatórias.

---

# 110. RESPOSTA APÓS CADA FASE

Usar somente:

```text
FASE X — PASS / FAIL

Implementado:
- ...

Migration:
- ...

Testes:
XX PASS / XX FAIL

Build:
PASS / FAIL

Integração real:
VERIFICADA / NÃO VERIFICADA

Pendência:
- ...

Próxima ação:
...
```

Sem ensaios longos.

---

# 111. NÃO PEDIR CONFIRMAÇÃO TODA HORA

Continue automaticamente enquanto:

- não excluir dados reais;
- não gerar custo externo relevante;
- não exigir contratação;
- não publicar algo destrutivo;
- não precisar de credencial ausente;
- não ultrapassar o STOP GATE do MVP.

---

# 112. QUANDO PRECISAR DE SECRET

Prepare tudo.

Depois peça apenas:

```text
VARIÁVEL:
MERCADOLIVRE_CLIENT_ID

PRECISO:
App ID do Mercado Livre.
```

Não parar várias etapas antes.

---

# 113. NÃO REPETIR PERGUNTAS

Se estiver em:

```text
este prompt

PROJECT_STATE.md

.env

código

configuração
```

não perguntar novamente.

---

# 114. DEFINIÇÃO DO MVP COMERCIAL

O primeiro SellerOS comercialmente testável é:

```text
SELLEROS
   │
   └── ReturnShield
          │
          ├── Mercado Livre OAuth
          ├── Products
          ├── Orders
          ├── Claims
          ├── Returns
          ├── Money at Risk
          ├── Risk Score
          ├── Prioritization
          ├── Evidence Pack
          └── Defense Copilot
```

---

# 115. O QUE VEM DEPOIS

Somente após validação:

```text
ReturnShield
↓
Profit Engine
↓
Profit Leak
↓
Fee Guard
↓
Reputation Guard
↓
Catalog Doctor
↓
Competitor Intelligence
↓
Seller Copilot
↓
Shopee
↓
TikTok
↓
Execution Agents
↓
Execution Engine
↓
Agent Firewall
↓
Commerce Control Plane
```

---

# 116. VISÃO FINAL

```text
                       SELLEROS
                          │
                 COMMERCE CONTROL PLANE
                          │
         ┌────────────────┼────────────────┐
         │                │                │
      PROTECT           PROFIT          OPTIMIZE
         │                │                │
   ReturnShield      Profit Engine    Catalog Doctor
   Fee Guard         Profit Leak      Competitor Intel
   Reputation Guard                 Opportunity Intel
         │                │                │
         └────────────────┼────────────────┘
                          │
                    RECOMMENDATIONS
                          │
                    SELLER COPILOT
                          │
                       AGENTS
                          │
                  EXECUTION ENGINE
                          │
                   AGENT FIREWALL
                          │
                 EXECUTION POLICIES
                          │
                  CHANNEL ADAPTERS
                          │
          ┌───────────────┼──────────────┐
          │               │              │
    Mercado Livre       Shopee      TikTok Shop
                          │
                        AUDIT
```

---

# 117. PRINCÍPIO ECONÔMICO FINAL

O projeto deve crescer proporcionalmente ao valor comprovado.

Não fazer:

```text
16 módulos
antes
de 1 seller usar.
```

Fazer:

```text
1 dor forte
↓
1 MVP
↓
1 seller
↓
10 sellers
↓
valor comprovado
↓
novo módulo
```

---

# 118. PRIMEIRA AÇÃO AGORA

Execute imediatamente:

```text
1. inspecione o projeto;

2. encontre stack, banco, rotas, auth, migrations e testes;

3. crie/atualize PROJECT_STATE.md;

4. identifique a primeira fase incompleta ENTRE AS FASES 0–8;

5. implemente somente essa lacuna;

6. crie migration se necessário;

7. rode typecheck;

8. rode testes;

9. corrija;

10. avance para a próxima fase;

11. continue até o ReturnShield MVP estar funcional;

12. publique/teste;

13. ao atingir MVP_READY_FOR_REAL_VALIDATION, PARE a expansão.
```

Não construa Profit Leak automaticamente.

Não construa Shopee.

Não construa TikTok.

Não construa agentes.

Não construa o Control Plane inteiro.

Primeiro prove que:

# RETURNSHIELD RESOLVE UMA DOR REAL.

Depois expandiremos.

# CONSTRUA O MENOR PRODUTO CAPAZ DE PROVAR A TESE.

