# ADR-0001: Separate Go REST API and web client

- Status: accepted
- Date: 2026-11-14

## Decision

Use Next.js with TypeScript for the web client, and a separate Go/Gin JSON REST API for application behavior and data access. Use PostgreSQL with GORM for routine persistence and versioned SQL migrations for schema changes.

## Context

The project is an individual finance management web app with screenshot-assisted transaction entry. The owner wants to learn Go while keeping a widely used React-based frontend. The API boundary also keeps provider credentials and financial-data rules server-side.

## Consequences

- Frontend and API run as separate local services and communicate over HTTP.
- Keep authentication, authorization, validation, and provider calls in Go.
- Define and maintain a clear REST contract between the web app and API.
- The initial scaffold must be corrected to use explicit migrations and real authentication before it handles private records.
