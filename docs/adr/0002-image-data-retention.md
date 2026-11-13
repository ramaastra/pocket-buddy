# ADR-0002: Delete transaction images after extraction

- Status: accepted
- Date: 2026-11-14

## Decision

Use screenshot images only to extract transaction drafts, delete image data after extraction, and persist only transactions that the user confirms. Keep unconfirmed drafts in the browser during review.

## Context

Images can contain private financial and account details. The app should minimize retained sensitive data while keeping the user in control of what becomes a transaction.

## Consequences

- Use temporary upload handling with cleanup on both success and error paths.
- Do not store the raw image in the database or logs.
- Show extracted fields for review; never save them without explicit confirmation.
- Use synthetic or redacted images for free-tier provider experimentation.
