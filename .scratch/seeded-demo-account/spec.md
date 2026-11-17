# Seeded database demo account

## Goal

Provide a separate signed-in demo account backed by PostgreSQL and preloaded with synthetic sample data. Newly registered accounts remain empty, and the existing unsigned browser-local demo stays separate.

## Behavior

- Configure the demo email and password through `DEMO_ACCOUNT_EMAIL` and `DEMO_ACCOUNT_PASSWORD`.
- On API startup, create the verified demo user and seed categories, transactions, budgets, and recurring schedules in one database transaction, only when that email is new.
- Hash the password using the existing Argon2id implementation.
- Never overwrite an existing account or re-seed its data on restart.
- Pass the same configured credentials to the web app so the sign-in page can fill them for the user.
- Use synthetic sample financial data only.

## Out of scope

- Resetting or restoring demo data after users edit or delete it.
- Changing new-account registration or importing browser-local demo records.
- Production deployment or a production email provider.
