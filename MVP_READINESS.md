# SellerOS / ReturnShield MVP Readiness

- Production URL: https://selleros.xxxdiogenes.workers.dev
- Application commit: `aab7273`
- Tests: 68 PASS / 0 FAIL
- Applied migrations: 0001–0007
- Production model: `gpt-5.6-luna`

## Implemented

- Authenticated workspaces with RBAC, signed sessions, same-origin mutation checks, and persistent rate limits.
- Mercado Livre OAuth with PKCE, encrypted token lifecycle, and read-only products, orders, claims, and returns sync.
- ReturnShield Money at Risk estimate, Risk Score V1, prioritization, Evidence Pack, attachment proxy, and Defense Copilot.
- Audit logging, source-reference validation, prompt-injection protection, AI caching, stale-analysis recovery, and provider timeout protection.

## Verified integrations

- Real Mercado Livre OAuth and read APIs.
- Real OpenAI Responses API with Structured Output.
- Production smoke tests and zero-data account UX.

## Known limitations

- The connected seller has no listings, orders, claims, or returns. Real persistence, Evidence Pack, Money at Risk, attachment download, and Defense Copilot case validation remain pending real seller data.
- Marketplace business writes, automated messages, refunds, and AI execution actions are not implemented.

## Real seller validation checklist

1. Connect a real seller and run sync.
2. Confirm product and order counts.
3. Confirm a claim appears and validate Money at Risk and Risk Score inputs manually.
4. Sync the Evidence Pack and compare its timeline with Mercado Livre.
5. Open/download one real attachment.
6. Run Defense Copilot once and verify facts, source refs, and no invented claims.
7. Ask the seller whether it saved time and whether they would pay for it.
