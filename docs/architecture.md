# Architecture and development

## Chosen stack

- Web client: Next.js, React, TypeScript (`apps/web`). Next.js is the frontend only.
- Web UI: Mantine for shared interactive controls and surfaces, with project CSS for Pocket Buddy's design. Transaction lists retain their responsive row layout.
- API: Go with Gin, JSON REST (`services/api`). Business rules and authentication belong here.
- Database: PostgreSQL. GORM handles routine persistence; schema changes use explicit versioned SQL migrations via `golang-migrate`.
- Local orchestration: Docker Compose.
- Local email testing: Mailpit captures verification and password-reset emails without delivering them externally. A production email provider remains to be configured.
- AI extraction: Gemini API called server-side from Go. Keep provider-specific request/response handling behind an interface.

## Service boundaries

The browser calls the Go API. The Go API validates inputs, enforces user ownership and business rules, persists confirmed records, and calls external services. The browser must never receive the Gemini API key or database credentials. Do not introduce Next.js API routes as a second application backend without updating this decision and the API contract.

## Data conventions

- Store money as integer minor units with an explicit ISO 4217 currency code. Never use floating point for stored or calculated monetary amounts.
- A transaction has a required `kind` (`income` or `expense`) and at most one optional category. Category type must agree with transaction kind.
- Store calendar transaction dates as dates, not timestamps. Store security and audit event times as UTC timestamps.
- Enforce ownership in every database query that reads or changes user data.
- Preserve user records through schema migrations; migrations must have a reviewed rollback where feasible.

## Local development

Run `docker compose up --build` for the web client on port 3000, API on 8080, PostgreSQL on 5432, and Mailpit web UI on 8025. Mail is restricted to local Mailpit; no production provider is configured. The migration runner uses a separate connection pool from the application. Existing databases created by the former auto-migration scaffold require a reviewed adoption procedure; do not apply the initial migration blindly or destroy existing data.

## Implementation status

The Pocket Buddy client app is mounted from the persistent root layout, keeping session and account bootstrap state alive across route changes. The full-screen account loading state is reserved for initial bootstrap and signed-in account loading; four smaller brand sparkles appear around and over the logo in randomized positions. One sparkle is visible immediately, then the sparkles twinkle. Their light colors contrast with the wallet surfaces beneath them. Reduced-motion preferences show static sparkles. Route navigation keeps the app shell and current account data mounted. Navigation that takes longer than 120 ms shows a thin, indeterminate progress bar at the top of the screen, including on browser Back/Forward. It clears when the pathname changes; reduced-motion preferences switch it to a static bar.

Signed-in financial screens load categories, transactions, budgets and settings from the API; unsigned users retain the separate browser-local demo. Transaction and budget filtering, sorting, and pagination, plus dashboard totals and CSV export, operate on the complete client-loaded dataset. Currency-aware integer minor-unit storage and fractional-currency entry/display support IDR, USD, SGD, and AUD. The API includes local email verification and reset, account deletion, settings, category, transaction, extraction, budget and recurring routes. Registration collects only an email; the owner chooses the account password after verifying it. Pending registrations and sign-in attempts can request another verification email with a per-account cooldown. Existing verified accounts and their records are not changed by registration attempts. Signed-in recurring schedules and pending occurrence review use the API. Signed-in screenshot extraction calls Gemini from Go and returns editable drafts; only confirmed drafts are saved. Set `GEMINI_API_KEY` for extraction; without it, the API returns a configuration error. The key is never sent to the browser. The unsigned demo keeps its sample extraction behavior. On startup, the API creates a verified database demo account and sample records only if its configured email is new. `DEMO_ACCOUNT_EMAIL` and `DEMO_ACCOUNT_PASSWORD` must be configured together; Compose defaults are for local use. Compose passes the same credentials to the sign-in page for one-click filling. The seed is not a reset mechanism: existing data is never overwritten. Forwarded proxy headers are disabled by default. Do not expose this incomplete stack publicly.

## List display pattern

Budget and recurring schedule lists share search, domain filters, empty results, and 25-item pagination through ListDisplay. Categories use the same controls but paginate parent groups so children stay with their parent; search includes child names. Transactions retain their date/type/category filters and responsive ledger. Shared pagination exposes previous/next controls and result counts, including on a single page. Controls wrap on mobile while each dataset keeps its existing responsive row presentation. These controls operate on the loaded client dataset; recurring schedules use account data when signed in. List cards grow with their visible rows up to the available viewport height; longer pages scroll within the rows while the toolbar and pagination stay visible. On very short screens, the page may also scroll to keep the controls accessible.

Overview cards show up to five transactions and three budgets, with “View all” links to the full lists. Budget previews prioritize the highest spending-to-limit ratios, including over-budget items first. Overview cards do not paginate or scroll internally.

List pages also offer ascending/descending sorting through the shared dropdown. Ordering applies to all filtered results before pagination; all screen sizes edit sorting alongside filters in the modal. Reset restores the page's default sort, category groups preserve parent/child structure, and transaction CSV export follows the selected order.

Applied list search, filters, sorting, and pagination are stored in URL query parameters. The client subscribes to browser history changes and batches URL updates from one action; search replaces history while applied controls push entries. Modal drafts remain local until applied. Query values are validated before use, and direct links, reload, and browser Back/Forward restore list state.

Category migration 000006 adds a unique active name per user and transaction kind; it fails without changing existing data if an existing database contains case-insensitive duplicates. Resolve those duplicates deliberately before retrying. Its down migration can fail if names were reused after deletion; preserve the records and resolve conflicts before rollback.

Budget migration 000007 replaces the original all-record uniqueness constraint with a partial unique index on active budgets. A user can create a new budget for a category and period after deleting the old one. Its down migration can fail when such historical duplicates exist; resolve conflicts before rollback. Budget deletion is soft deletion. Automatic purge or restore for deleted budgets remains undecided.

The unsigned demo calculates each budget's current-week or current-month spending from its active browser-local expense transactions. Parent demo budgets include direct child-category spending. Stored sample `spent` values are ignored for display, so adding, editing, or deleting a demo transaction updates the relevant budget progress.

Recurring migration 000008 records schedule anchors and snapshots occurrence fields, preserving pending drafts when schedules change. The API generates due occurrences on account refresh using the browser’s calendar date, with unique schedule/date entries and transactional confirmation. Pending occurrences stay available while schedules are paused; resuming advances past dates missed while paused. Deleting a schedule soft-deletes its pending occurrences. The rollback drops snapshot fields and should only be used after preserving any occurrence data needed for recovery.
