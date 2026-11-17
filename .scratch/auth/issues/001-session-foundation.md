# 001: Replace development identity with authenticated sessions

Status: local development authentication implemented; production deployment deferred.

## Acceptance criteria

- [x] API startup applies ordered SQL migrations; it does not use GORM auto-migration.
- [x] Registration hashes passwords with Argon2id and creates a user.
- [x] Login verifies the password and issues a cryptographically random session cookie.
- [x] Session storage contains token hashes, not raw cookie values.
- [x] Transaction list/create require a valid session and use the authenticated user ID.
- [x] State-changing cookie requests validate CSRF and request origin.
- [x] Logout revokes the current session.
- [x] Sensitive values and financial payloads are not logged by application handlers.
- [x] Relevant security and architecture docs describe implemented behavior and remaining gaps.
- [x] Add browser sign-in/registration and connect the dashboard to the authenticated API.
- [x] Implement email verification, password reset, account deletion, and local in-process rate limiting.
- [x] Add a repeatable local Mailpit integration test for registration, verification, sign-in, password reset, and logout.
- [x] Add a repeatable Chrome browser flow through registration, Mailpit verification, password reset, sign-in, and sign-out.
- [x] Verify the current development database is already at migration version 10 with a clean state; no adoption migration is needed for it.

Production deployment, distributed rate limiting, and automatic adoption of a different pre-migration legacy database are outside the current development-only scope.

The inspected development schema already had populated migration history at version 10 with `dirty=false`. API startup also refuses to apply the initial migration blindly when Pocket Buddy tables exist without populated migration history; see `docs/database-adoption.md` for the manual review path for any different legacy database.
