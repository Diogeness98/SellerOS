# Mercado Livre DPP Certification Readiness

## Objective

This internal SellerOS area records technical readiness for a future Mercado Livre Developer Partner Program application. It is not an application, certification, partnership, badge, or approval claim.

## Access and architecture

Administrative routes are protected in the Worker by the `platform_admins` allow-list. Workspace OWNER, ADMIN, MANAGER, OPERATOR, and VIEWER roles do not grant global administration. The allow-list is intentionally empty after migration and must be populated through a separate, reviewed operational procedure.

The readiness dashboard uses persisted checks, versionable DPP configuration, aggregate GMVe data, evidence references, initiatives, incident records, and a safe JSON export. It never exports OAuth tokens, passwords, hashes, session secrets, or unnecessary personal data.

## Checklist and security

The baseline covers OAuth Authorization Code with PKCE and state validation, backend-only encrypted tokens, refresh handling, workspace isolation, disconnect handling, audit logs, rate limiting, notification idempotency readiness, privacy review, incident response, GMVe tracking, and active-seller tracking.

Checks that require legal, operational, or official Mercado Livre confirmation remain `NEEDS_REVIEW` or `PARTIAL`; they are not inferred as passing.

## GMVe

GMVe is always an internal estimate. Monthly BRL totals use only synchronized orders. USD is shown only when an auditable rate, date, and source exist in `dpp_gmve_monthly`; otherwise the UI reports that USD GMVe is unavailable. The default Brazil target is versionable DPP configuration (`DPP_GMVE_TARGET_USD`) and does not establish eligibility.

## Evidence, initiatives, and incidents

Evidence stores references, not credentials or unnecessary sensitive payloads. Initiatives track official-source references, priority, mandatory status, deadlines, status, and evidence. Incident records support human-led containment, communication, resolution, and post-mortem work. No notification to Mercado Livre is sent automatically.

## Future application

Before any future application, a human must verify current official requirements, configure approved platform administrators, review privacy and account-deletion obligations, supply auditable FX data, and evaluate live seller usage and GMVe.

## DO NOT CLAIM CERTIFICATION

SellerOS and ReturnShield must not claim to be Mercado Livre certified, a Developer Partner, Silver/Gold/Platinum, or otherwise approved until official confirmation has been received from Mercado Livre.
