# Pocket Buddy

A personal finance web app for tracking income, expenses, budgets, and recurring transactions, with AI-assisted screenshot import.

## Stack

- Web: Next.js + TypeScript (`apps/web`)
- API: Go + Gin (`services/api`)
- Database: PostgreSQL + GORM, with versioned SQL migrations
- Local services: Docker Compose

## Local development

Copy `.env.example` to `.env` and set secrets before enabling authentication or Gemini extraction. Start services with `docker compose up --build`. The frontend is at http://localhost:3000 and the API health endpoint is at http://localhost:8080/api/health.

Do not use real financial screenshots with free hosted model tiers. Use synthetic or redacted examples.
