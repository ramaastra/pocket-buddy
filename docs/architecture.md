# Architecture and development

## Chosen stack

- Web client: Next.js, React, TypeScript (`apps/web`). Next.js is the frontend only.
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

This document describes the agreed target architecture. The web client currently renders a development-only English dark UI prototype with compact mobile and desktop layouts plus an editorial alternative; it uses browser-only sample data and does not call the API or provide sign-in screens. The API embeds and applies the versioned SQL migrations at startup, and has initial registration/login/logout endpoints with session middleware for user-scoped transaction routes. Email verification/reset, account deletion, deployment-grade rate limiting, and existing-database adoption are outstanding. Forwarded proxy headers are disabled by default and need explicit trusted-proxy configuration behind a reverse proxy. Resolve these gaps before treating the stack as production-ready or exposing it publicly.
