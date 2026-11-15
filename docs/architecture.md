# Architecture and development

## Chosen stack

- Web client: Next.js, React, TypeScript (`apps/web`). Next.js is the frontend only.
- Web UI: Mantine for shared interactive controls and surfaces, with project CSS for Pocket Buddy's design. Transaction lists retain their responsive row layout.
- API: Go with Gin, JSON REST (`services/api`). Business rules and authentication belong here.
- Database: PostgreSQL. GORM handles routine persistence; schema changes use explicit versioned SQL migrations via `golang-migrate`.
- Local orchestration: Docker Compose.
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

The intended local setup is `docker compose up --build`, with the web app at port 3000, API at port 8080, and PostgreSQL at port 5432. Required services and migration startup still need implementation/verification. Copy `.env.example` to `.env` for local secrets; never commit `.env`.

## Implementation status

This document describes the agreed target architecture. The web client now renders the planned dashboard, transaction history/forms/recently-deleted/receipt scan, budget list/form/details, recurring schedule list/form/details, category management, settings, and sign-in/registration/verification/password-reset routes. These are interactive front-end demos backed by sample data in browser local storage; receipt extraction, authentication, and CSV export are simulated or browser-local, and the app does not call the API. The API embeds and applies the versioned SQL migrations at startup, and has initial registration/login/logout endpoints with session middleware for user-scoped transaction routes. Production email verification/reset, account deletion, deployment-grade rate limiting, and existing-database adoption are outstanding. Forwarded proxy headers are disabled by default and need explicit trusted-proxy configuration behind a reverse proxy. Resolve these gaps before treating the stack as production-ready or exposing it publicly.

## List display pattern

Budget and recurring schedule lists share search, domain filters, empty results, and 25-item pagination through ListDisplay. Categories use the same controls but paginate parent groups so children stay with their parent; search includes child names. Transactions retain their date/type/category filters and responsive ledger. Shared pagination exposes previous/next controls and result counts, including on a single page. Controls wrap on mobile while each dataset keeps its existing responsive row presentation. These controls operate on browser-local demo data.

Overview cards show up to five transactions and three budgets, with “View all” links to the full lists. Budget previews prioritize the highest spending-to-limit ratios, including over-budget items first. Overview cards do not paginate or scroll internally.

List pages also offer ascending/descending sorting through the shared dropdown. Ordering applies to all filtered results before pagination; all screen sizes edit sorting alongside filters in the modal. Reset restores the page's default sort, category groups preserve parent/child structure, and transaction CSV export follows the selected order.

Applied list search, filters, sorting, and pagination are stored in URL query parameters. The client subscribes to browser history changes and batches URL updates from one action; search replaces history while applied controls push entries. Modal drafts remain local until applied. Query values are validated before use, and direct links, reload, and browser Back/Forward restore list state.
