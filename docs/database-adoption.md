# Adopting a database from the former GORM scaffold

The API runs versioned SQL migrations from `services/api/migrations`. A database created by the former GORM `AutoMigrate` scaffold has no `schema_migrations` history, so the API must not treat it as empty and apply migration `000001`.

## Current protection

At startup, the API checks for Pocket Buddy tables when migration history is absent. If it finds any, startup stops before the migration runner can create `schema_migrations` or change the schema. The error directs the operator here. This check is intentionally conservative: it can also stop on a partial or abandoned schema, which must be reviewed rather than guessed at.

## Adoption procedure

Adoption is an operator-reviewed procedure and is not currently automated. Do not mark a database as migrated merely to bypass the startup check.

1. Stop all API instances and take a PostgreSQL backup. Confirm that the backup can be restored to an isolated database.
2. Record the PostgreSQL version, table definitions, indexes, constraints, sequences, extensions, row counts, and foreign-key violations. Keep this report with the deployment change.
3. Compare the database against the historical GORM models and the exact target migration schema. The current SQL schema includes authentication, verification tokens, soft deletion, recurring occurrences, and other fields that may not exist in the old scaffold.
4. Write and review a forward-only adoption migration for the observed schema. It must preserve account and financial rows, resolve incompatible constraints deliberately, and be safe to retry or have a documented recovery path.
5. Apply it to a restored copy first. Verify row counts, ownership links, category links, account access, transaction totals, and recurring records before and after.
6. Schedule a maintenance window, take a fresh backup, apply the reviewed migration, and verify the deployed database before starting the API.

If the old schema cannot be identified confidently, restore the backup into an isolated environment and migrate from there. Never drop existing tables, run `000001` against them, or stamp a migration version without proving that every earlier migration's effects are present.

## Local development

Development applies migrations at API startup. If you restore a legacy database locally, use a disposable copy first and keep the source backup unchanged.

The startup guard fails closed for unversioned databases, but it is not a complete schema fingerprint and does not perform the adoption itself.
