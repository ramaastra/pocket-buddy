# Pocket Buddy

A personal finance app with a Next.js web client, Go API, and PostgreSQL database. It is currently intended for local development only; production deployment is out of scope.

## Local development

Run `docker compose up --build`. Open the web app at http://localhost:3000, API health at http://localhost:8080/api/health, and the Mailpit inbox at http://localhost:8025. PostgreSQL is available on port 5432. The API applies versioned SQL migrations at startup; it stops rather than applying the initial migration to an unversioned database that already contains Pocket Buddy tables. See [the database adoption notes](docs/database-adoption.md) before using a different existing database.

Local Compose seeds one verified demo account with synthetic sample data on first startup. Sign in with `demo@pocketbuddy.local` and `PocketBuddyDemo2026!`, or use the **Demo** button on the sign-in form to fill the credentials. Set `DEMO_ACCOUNT_EMAIL` and `DEMO_ACCOUNT_PASSWORD` together to choose different local demo credentials. The seed never resets an existing account or overwrites its data. Keep demo records synthetic.

New registrations start empty. Verification and password-reset messages are captured by Mailpit and are not delivered externally. To run the Go API outside Compose, set `DATABASE_URL`, `WEB_ORIGIN`, and `MAILPIT_HOST=localhost` as needed. Never commit personal credentials or environment files.

## What works locally

- Signed-in accounts can manage income and expense transactions, categories, weekly and monthly budgets, recurring schedules, and account settings. Transactions support search and filters, sorting, CSV export, and Recently Deleted with restore.
- Account settings support IDR, USD, SGD, and AUD. Changing the display currency relabels saved amounts without converting them; the app asks for confirmation first.
- Registration, email verification, sign-in, password reset, logout, and account deletion use the API. The unsigned demo remains separate and stores its data in the browser.
- Screenshot extraction returns editable Gemini drafts; only confirmed drafts are saved. Configure `GEMINI_API_KEY` in the API environment to use it. Images are not stored. For free-tier experimentation, use synthetic or redacted screenshots only.

## Checks

Run frontend unit tests with `cd apps/web && npm test`. Run Go checks with `cd services/api && go test ./...`; database integration tests require `TEST_DATABASE_URL` to point to an isolated disposable PostgreSQL database.

For the local auth and Mailpit integration, start the Compose `db` and `mailpit` services and run `./scripts/test-auth-mailpit.sh`. It creates and drops a temporary database. For the browser auth flow, start the full Compose stack and run `./scripts/test-auth-browser.sh`; it requires Google Chrome, restarts the local API to clear its in-process auth throttles, and removes its temporary account and Mailpit messages. Both scripts use local Compose defaults without loading a project `.env` file.

See [architecture](docs/architecture.md) and [security](docs/security.md) for service boundaries, migration behavior, and local-development limitations.
