# Pocket Buddy product brief

## Purpose

Pocket Buddy helps an individual understand and manage everyday income and expenses. Its first release prioritizes quick transaction entry, clear cash-flow summaries, and user-controlled budgets.

## MVP features

- Email/password registration, login, verification, password reset, logout, and account deletion.
- Manual income and expense transactions with date, amount, optional merchant, note, and optional category.
- Searchable transaction history, date/type/category filters, and period summaries.
- One editable opening balance, separate from income and expenses.
- User-managed income and expense categories with parent/child organization. Transactions can be uncategorized; every transaction still has an independent income/expense kind.
- Weekly and monthly expense budgets. A budget can target a parent or child category; child spending rolls up to a parent budget. Parent and child budgets may coexist and are reported separately.
- Recurring transaction schedules (weekly, monthly, yearly) that create pending occurrences for user review. Users can edit and confirm, skip, or leave an occurrence pending. Schedules can be paused/resumed; schedule edits affect future occurrences only.
- Screenshot-to-transaction extraction using a hosted vision model. Accept one uploaded image or camera photo at a time; extract one or more drafts, highlight uncertain/missing fields, and let the user edit, confirm, or skip each draft. Delete the image after extraction. Persist only confirmed transactions.
- CSV transaction export.
- Recently Deleted page with restore for up to 30 days; deletion immediately removes a transaction from totals.
- Seeded sample data for a separate demo account.

## Product decisions

- Single currency per user, initially IDR; users may change the display currency later. Existing amounts are not converted automatically. A deliberate conversion workflow is future work.
- Language and currency settings are independent. The demo can save an English or Indonesian language preference; its interface remains in English until translations are implemented.
- Available cash is opening balance plus income minus expenses, including uncategorized transactions.
- Budgets are planning limits and do not themselves change cash balance.
- No multiple accounts, transfers, CSV import, PDF import, or general-purpose AI assistant in the MVP.
- Screenshot extraction uses Gemini initially behind a provider boundary. Free-tier use is for synthetic or redacted images only.
- Hosting is optional. If a suitable free host is unavailable, provide a demo recording with sample data and link it from the repository.

## Current delivery status

The web client now contains the MVP route set as an interactive responsive demo with a locked Color split Bifold wallet mark: a narrow full-height light-purple strip at the far left and a circular clasp, set directly beside the wordmark without a tile background. It uses English, IDR sample data, and browser local storage; it does not call the API. Transaction editing/deletion and restore, category and budget management, recurring review, receipt draft review, CSV export, and settings have front-end demo interactions. Authentication and receipt extraction are simulated. UI work should continue to follow [docs/design-direction.md](design-direction.md). The API has a versioned migration runner and initial registration/login/logout with user-scoped transaction list/create routes. Production email verification/reset, account deletion, deployment-grade rate limiting, durable financial data, Gemini extraction, and seeded demo-account support remain outstanding. The initial scaffold is not production-ready.
