# Security and privacy requirements

Pocket Buddy handles sensitive financial records. These are requirements for implementation, not a claim that the current scaffold satisfies them.

## Authentication

- Email and password only for the MVP; no social login.
- Hash passwords using Argon2id with parameters appropriate to the deployment environment. Never store or log plaintext passwords.
- Use server-side sessions with cryptographically random identifiers in `Secure`, `HttpOnly`, `SameSite` cookies over HTTPS in production.
- Store only hashes of session and CSRF secrets. Implement CSRF checks for state-changing cookie-authenticated requests, strict origin validation, login rate limiting, and session rotation/revocation.
- Email verification and password reset use random, single-use, expiring tokens; store token hashes and avoid account-enumeration responses.
- Require re-authentication for sensitive account actions where appropriate; revoke sessions after password change and account deletion.

## Financial data

- Scope every record query to the authenticated user.
- Validate amount, currency, transaction kind, category ownership/type, and all date inputs on the server.
- Do not log financial payloads, uploaded images, credentials, session identifiers, reset/verification tokens, or provider keys.
- Upload screenshots only for extraction. Do not persist the image; remove temporary data after the provider responds, including on error paths.
- For free-tier AI experimentation, use synthetic or redacted screenshots. Tell users before sending an image to a third-party provider.
- Keep provider keys in server environment configuration, never in frontend bundles or committed files.
- Account deletion must remove or anonymize all associated records in accordance with the product's chosen retention behavior.

## Current caveat

The API now has registration, login, logout, Argon2id password hashes, hashed random session and CSRF secrets, strict configured-origin checks, and user-scoped transaction routes. Login and registration are rate-limited in process by client IP. Secure cookies default on when `WEB_ORIGIN` uses HTTPS; set `COOKIE_SECURE=true` explicitly in production. Forwarded proxy headers are not trusted by default; deployments behind a reverse proxy must configure trusted proxies before relying on IP-based rate limits.

This is not production-complete: email verification, password reset, account deletion, session revocation after password changes, persistent/distributed rate limiting, and a browser sign-in flow are still missing. Registration currently creates a usable session immediately. Existing databases created by the former auto-migration scaffold also need a reviewed adoption migration before the versioned migration runner can start against them. Keep the deployment local until these gaps are addressed.
