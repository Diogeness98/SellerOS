# Repository Guidelines

## Permanent Codex Rules

Treat this file as the repository’s persistent instruction layer. Inspect context before editing and follow these rules unless a specific user request overrides them. Keep changes scoped, preserve user work, and do not invent structure, commands, dependencies, or test results. Prefer reversible edits, explain assumptions, protect secrets, and report verification.

When instructions conflict, use this order: user request, this file, platform safety requirements, then general conventions. Update this file when project conventions become established.

Permanent project rules:

- Make the smallest change that satisfies the request.
- Do not rewrite working code without a clear need.
- Use TypeScript for project code.
- Read `PROJECT_STATE.md` before continuing a future session and keep it short and current.
- Run typechecking and tests after relevant changes.
- Do not install dependencies unless necessary.
- Do not introduce complex architecture prematurely.
- Do not perform destructive actions without explicit authorization.
- Never store secrets in source code or committed configuration.
- Do not build future phases before the defined gate.
- Conserve tokens, tool calls, and agent time.

## Project Structure & Module Organization

This repository is currently an empty scaffold. As implementation is added, use this layout:

- `src/` for application code, grouped by feature or domain.
- `tests/` for integration and end-to-end tests.
- `assets/` for static images, fixtures, and other non-code resources.
- `scripts/` for repeatable development and release utilities.

Avoid committing generated output, dependencies, secrets, or editor state.

## Build, Test, and Development Commands

No build system or package manifest is committed yet. Document the command set in `README.md`. Prefer:

- `npm run dev` — start the local development environment.
- `npm run build` — create a production build.
- `npm test` — run the complete automated test suite.
- `npm run lint` — check formatting and static-analysis rules.

Only document commands that run from the repository root.

## Coding Style & Naming Conventions

Follow the project formatter and linter, committing their configuration. Use spaces, UTF-8, and final newlines. Use `PascalCase` for types/components, `camelCase` for functions/variables, and `kebab-case` for directories and non-component files.

## Testing Guidelines

Every behavior change should include a test or explain why testing is impractical. Name tests after observable behavior, such as `creates-order-when-payment-succeeds`. Keep tests deterministic and independent of production services.

## Commit & Pull Request Guidelines

There is no Git history from which to infer an existing convention. Use short, imperative commit subjects, optionally following Conventional Commits (for example, `feat: add order import`). Keep each commit reviewable and scoped to one concern.

Pull requests should explain the problem, summarize the solution, list verification performed, and link relevant issues. Include screenshots or recordings for visible UI changes and call out migrations, configuration changes, or follow-up work explicitly.

## Security & Configuration

Never commit credentials. Store local values in ignored `.env` files, provide a sanitized `.env.example`, and document every required variable without including real secrets.
