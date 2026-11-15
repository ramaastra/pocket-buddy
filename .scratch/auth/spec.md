# Authentication and ownership foundation

## Goal

Replace the fixed development identity with real authenticated sessions before private multi-user records are exposed.

## First slice

- Run the versioned PostgreSQL migrations at API startup and remove GORM auto-migration.
- Implement registration and login with Argon2id password hashes.
- Store only hashes of random session and CSRF secrets; use secure, HTTP-only, same-site cookies.
- Require an authenticated session for transaction list/create and scope every query to that user.
- Protect state-changing cookie-authenticated requests with CSRF and strict origin checks.
- Provide logout that revokes the current session.

Email verification, password reset, rate limiting, account deletion, and the web auth screens are follow-up slices; do not present authentication as production-complete until those flows are implemented and operational settings are reviewed.
