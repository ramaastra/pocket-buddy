# Pocket Buddy

A personal finance app with a Next.js web client, Go API and PostgreSQL database.

## Local development

Run `docker compose up --build`. Open http://localhost:3000 for the web client, http://localhost:8080/api/health for API health, and http://localhost:8025 for Mailpit. Registration requests an email address; follow its verification link and choose a password to finish. Registration and password reset emails are sent only to local Mailpit; no external mail provider is configured. For a Go API running outside Compose, set `DATABASE_URL`, `WEB_ORIGIN`, and `MAILPIT_HOST=localhost` as appropriate. `COOKIE_SECURE=true` is required for HTTPS deployment. Never commit credentials or environment files.

The web financial screens still use browser-local demo data; they are not connected to the database. The API has initial authentication, settings and transaction endpoints, but the stack is not production-ready. See [architecture](docs/architecture.md) and [security](docs/security.md) for limits. Screenshot extraction is not implemented; do not upload real financial images.

Run Go checks with `cd services/api && go test ./...`. Database integration tests require `TEST_DATABASE_URL` pointing to an isolated disposable PostgreSQL database. Run the frontend production build with `npm ci && npm run build --workspace apps/web` from the repository root.

Signed-in financial screens currently support IDR transactions and settings. Categories are saved to signed-in accounts. Budgets and recurring schedules are still demo-only; signed-in users see these features as unavailable. The browser-local demo is separate and is not imported into accounts. Fractional currencies are not yet supported by the account UI.
