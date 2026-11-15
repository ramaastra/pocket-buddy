# 001: Replace development identity with authenticated sessions

Status: partially implemented.

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
- [ ] Add browser sign-in/registration and connect the dashboard to the authenticated API.
- [ ] Implement email verification, password reset, account deletion, and deployment-grade rate limiting.
- [ ] Add an adoption migration path for databases previously created by GORM auto-migration.
- [ ] Verify production cookie, proxy, origin, and session settings before deployment.
