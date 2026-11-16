# Pocket Buddy

A personal finance app with a Next.js web client, Go API and PostgreSQL database.

## Local development

Run `docker compose up --build`. Open http://localhost:3000 for the web client, http://localhost:8080/api/health for API health, and http://localhost:8025 for Mailpit. Registration requests an email address; follow its verification link and choose a password to finish. Registration and password reset emails are sent only to local Mailpit; no external mail provider is configured. For a Go API running outside Compose, set `DATABASE_URL`, `WEB_ORIGIN`, and `MAILPIT_HOST=localhost` as appropriate. `COOKIE_SECURE=true` is required for HTTPS deployment. Never commit credentials or environment files.

Signed-in financial screens load transactions, categories, budgets and settings from the API. The separate unsigned demo uses browser-local data. The stack is not production-ready; see [architecture](docs/architecture.md) and [security](docs/security.md) for limits. Screenshot extraction is not implemented; do not upload real financial images.

Run Go checks with `cd services/api && go test ./...`. Database integration tests require `TEST_DATABASE_URL` pointing to an isolated disposable PostgreSQL database. Run the frontend production build with `npm ci && npm run build --workspace apps/web` from the repository root.

Signed-in financial screens currently support IDR transactions, categories, budgets and settings. Recurring schedules are still demo-only; signed-in users see them as unavailable. The browser-local demo is separate and is not imported into accounts. Fractional currencies are not yet supported by the account UI.
