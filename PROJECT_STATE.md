# SellerOS Project State

## Current Phase
Phase 4A — Claims + Returns Foundation

## Status
LOCAL READY / REMOTE MIGRATION PENDING

## Stack
React, TypeScript, Vite, Cloudflare Workers, Cloudflare D1

## Implemented
- Fase 0 audit: repository initialized from empty scaffold.
- Vite/React frontend foundation.
- Cloudflare Vite Plugin configuration for a single Worker serving the React SPA and API.
- Workers Static Assets SPA routing with `/api/*` handled by the Worker first.
- D1 binding `DB` configured for the provisioned remote `selleros-db` database.
- Worker API with health route, session login foundation, workspace access, RBAC checks, and API errors.
- PBKDF2 password hashing with random salts and signed, expiring HMAC sessions using `SESSION_SECRET`.
- Shared auth/session types and workspace isolation helpers.
- D1 foundation migration for users, workspaces, memberships, and audit logs.
- OAuth 2.0 Authorization Code + PKCE S256 preparation for Mercado Livre.
- State-bound, expiring, single-use OAuth attempts linked to the authenticated user and workspace.
- AES-GCM token encryption abstraction using separate `TOKEN_ENCRYPTION_KEY`.
- First production OWNER/workspace created, verified, and bootstrap mechanism removed.
- Minimal login UI with same-origin, HttpOnly-cookie authentication.
- Signed-session restoration and logout endpoints; only safe session data is returned to the frontend.
- Mercado Livre connection UI that navigates to the OAuth connect route and safely reports connection status.
- OAuth external-failure diagnostics log only stage, HTTP status, safe error code, and request ID.
- OAuth Authorization Code + PKCE: VERIFIED.
- OAuth state validation and single-use attempt: VERIFIED.
- Real Mercado Livre authorization: PASS; `/users/me` completed in the Worker.
- Mercado Livre integration persisted in D1 with an external account ID, encrypted access/refresh tokens, and token expiration.
- Local Mercado Livre sync foundation for products and orders with idempotent, workspace-scoped persistence.
- Token service that refreshes only when needed and atomically replaces the one-time refresh token after a successful renewal.
- Sync job tracking with a per-workspace/integration `RUNNING` guard and safe result summaries.
- Real Mercado Livre products and orders requests verified against the connected seller account; the account returned zero listings and zero orders.
- Sync API returns `502/SYNC_FAILED` instead of HTTP 200 when the service reports `FAILED`; zero-data and partial-sync states are surfaced safely in the UI.
- Local, read-only Claims and Returns normalization through the existing Mercado Livre sync service.

## Database
Latest migration: `migrations/0004_claims_returns.sql` (local ready; remote not applied)

## Relevant Routes
- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/workspaces/:workspaceId`
- `PATCH /api/workspaces/:workspaceId`
- `GET /api/integrations/mercadolivre/connect`
- `GET /api/integrations/mercadolivre/callback`
- `GET /api/integrations/mercadolivre/status`
- `POST /api/integrations/mercadolivre/disconnect`
- `POST /api/integrations/mercadolivre/sync`
- `GET /api/integrations/mercadolivre/sync/status`

## Tests
42 PASS, 0 FAIL
Typecheck: PASS
Build: PASS

## Current Blockers
- Cloudflare authentication: READY
- Remote D1: READY
- Remote migrations: APPLIED
- Production deployment: PASS
- Existing production OWNER: YES
- Production OWNER: READY
- OWNER bootstrap: REMOVED
- Production login and signed session: PASS
- OWNER workspace access: PASS
- OWNER_BOOTSTRAP_SECRET: DELETED
- PBKDF2 Cloudflare compatibility fix: DEPLOYED
- Remote migration `0002_mercadolivre_oauth.sql`: APPLIED
- Mercado Livre configuration secrets: CONFIGURED
- Phase 2A + temporary bootstrap deployment: PASS
- Mercado Livre OAuth: PASS — REAL_WORLD_VERIFIED
- Phase 2B.3 OAuth UI: PASS
- Session restore and logout: PASS
- Mercado Livre connection UI: PASS
- OAuth Authorization Code + PKCE: VERIFIED
- State validation: VERIFIED
- Real Mercado Livre authorization: PASS
- `/users/me`: PASS
- Integration persisted in D1: PASS
- External account ID persisted: PASS
- Access token encrypted at rest: PASS
- Refresh token encrypted at rest: PASS
- Production OWNER/session: PASS
- Phase 3A local sync foundation: READY
- Remote migration `0003_commerce_sync.sql`: APPLIED
- Production deployment of Phase 3B: PASS
- Mercado Livre API real: VERIFIED
- Products request: VERIFIED
- Orders request: VERIFIED
- Sync job real: SUCCESS
- Products returned: 0
- Orders returned: 0
- Real-data persistence: NOT VERIFIED
- Reason: connected seller account contains no listings/orders
- Phase 4A Claims + Returns foundation: LOCAL READY
- Remote migration `0004_claims_returns.sql`: PENDING AUTHORIZATION
- Claims/Returns production deploy: NOT DONE
- Real Claims/Returns sync: NOT EXECUTED

## Deployment Readiness
Cloudflare deployment configuration: READY
Production smoke test: PASS
Production URL: https://selleros.xxxdiogenes.workers.dev
Phase 1.5 Auth Hardening: PASS
SESSION_SECRET: CONFIGURED
Production smoke test after Phase 2B.2 deploy: PASS
Production smoke test after Phase 2B.3 deploy: PASS

## Next Exact Task
Review and authorize remote application of `migrations/0004_claims_returns.sql`; then deploy and test Claims/Returns against the real API. Keep the integration read-only.
