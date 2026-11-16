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
- Account deletion must revoke access and sessions immediately, soft-delete the account and its associated records, and permanently erase them after 30 days. Deleted transactions are likewise permanently erased after their 30-day restore period.

## Current caveat

The API implements Argon2id password hashes, hashed session and CSRF secrets, configured-origin checks, in-process IP rate limiting, local Mailpit verification and password-reset tokens, and account deletion with session revocation and delayed purge. Database-backed integration tests cover budget ownership and category validation as well as authentication and transaction behavior; a local browser check covered signed-in budget create, spending, edit, delete, and reload. Full end-to-end and security review remain outstanding. Mail is restricted to Mailpit or loopback; a production email provider is not configured. Distributed rate limiting, deployment configuration, and adoption of databases created by the former scaffold remain outstanding. Signed-in categories, transactions, budgets and settings use the API; recurring schedules and pending occurrences use the API. Keep the deployment local until these gaps are addressed.

Screenshot extraction accepts one JPEG, PNG, or WEBP image up to 8 MB at the authenticated API. The image is held in request memory only and sent to Gemini; it is not written to disk or database. The browser discloses the external scanning service before upload and discards its selected file after extraction. For free-tier experimentation, use synthetic or redacted images only. Configure `GEMINI_API_KEY` only in the API environment. Extraction is rate-limited per client IP; production needs deployment-appropriate distributed limits and provider usage controls.

Registration returns the same response for new and already registered addresses, and local mail is sent asynchronously to reduce timing differences. No supplied registration password becomes active: the email owner chooses a password when confirming a single-use verification token. Verification and password reset revoke sessions and outstanding verification and reset tokens. Link checks and submissions carry tokens in request bodies; the browser removes token fragments from the address bar, and confirmation revalidates tokens after the initial check. Verification emails for pending accounts are limited to one per account per minute in addition to IP rate limiting; an unverified sign-in attempt triggers the same limited email request regardless of the submitted password. This is not a guarantee against timing or delivery-based account enumeration; production deployment still needs a security review and a reliable mail provider. Account deletion marks associated records deleted in the same transaction and revokes sessions; earlier transaction purge deadlines are retained. Migration 000005 backfills deletion markers for previously deleted accounts. Rolling it back removes the new markers but cannot automatically undo transaction deletion states.
