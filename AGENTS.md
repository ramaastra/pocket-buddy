# Repository guide

This file is the shared entry point for coding agents. Keep project knowledge in the ordinary Markdown documents linked below so it remains usable across tools and assistants.

## Read first

- [`docs/product.md`](docs/product.md): product goals, MVP scope, and agreed behavior.
- [`docs/design-direction.md`](docs/design-direction.md): required visual, typography, copy, and motion direction for UI work.
- [`docs/architecture.md`](docs/architecture.md): service boundaries, stack, local development, and implementation status.
- [`docs/security.md`](docs/security.md): security requirements and sensitive-data handling.
- [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md): current work tracking convention.
- [`docs/agents/git-workflow.md`](docs/agents/git-workflow.md): local Git checkpoints, branches, and confirmation after changes.
- [`docs/adr/`](docs/adr/): durable technical decisions.

## Working rules

- Keep the web frontend, Go API, and database boundaries described in `docs/architecture.md`.
- Treat financial values as integer minor units and always validate transaction kind independently of category.
- Never log passwords, session identifiers, CSRF tokens, API keys, or uploaded financial images.
- Do not retain screenshot uploads after extraction. Save only user-confirmed transactions.
- Do not claim a feature is complete unless it is implemented; update the implementation status in the relevant docs when it materially changes.
- Prefer small changes that preserve existing user data and provide a reversible path for data migrations.
- For every UI change, follow [`docs/design-direction.md`](docs/design-direction.md) for visuals, typography, copy, and motion.
