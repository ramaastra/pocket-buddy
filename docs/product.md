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

- Single currency per user, currently IDR. Other currencies need fractional amount support and a deliberate conversion workflow.
- When currency changes become available, changing currency relabels existing amounts without conversion; warn the user clearly before applying the change.
- New accounts start empty. Do not automatically import or erase browser-local demo data; provide sample data in a separate demo account.
- Weekly budgets start on Monday.
- A monthly recurring schedule anchored to a day missing in a month occurs on that month's last day, then returns to its original day when available.
- User-facing deletion is soft deletion. Deleted transactions can be restored for 30 days, then are permanently erased. Deleted accounts and their associated data are permanently erased after 30 days. Retention and restoration of other deleted records remains to be decided.
- Language and currency settings are independent. The demo can save an English or Indonesian language preference; its interface remains in English until translations are implemented.
- Available cash is opening balance plus income minus expenses, including uncategorized transactions.
- Budgets are planning limits and do not themselves change cash balance.
- No multiple accounts, transfers, CSV import, PDF import, or general-purpose AI assistant in the MVP.
- Screenshot extraction uses Gemini initially behind a provider boundary. Free-tier use is for synthetic or redacted images only.
- Hosting is optional. If a suitable free host is unavailable, provide a demo recording with sample data and link it from the repository.

## Current delivery status

Signed-in accounts load categories, transactions, recently deleted records, budgets, opening balance, currency and language from the API. Manual transaction create, edit, delete and restore, dashboard calculations, filtered CSV export, and weekly/monthly expense budgets use those records. Budget spending uses the current calendar period; parent budgets include child-category spending, and parent and child budgets remain separate plans. New accounts start empty; the browser-local demo remains separate. Account screens currently support IDR only; fractional-currency entry and display need implementation before other currencies can be used safely. Signed-in users can manage recurring schedules and review due occurrences; confirmed occurrences become transactions. Screenshot extraction and seeded demo accounts remain unfinished. The integration is local and is not production-ready.
