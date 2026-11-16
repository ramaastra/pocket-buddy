# 001: Connect budgets to accounts

Status: implemented and locally verified.

- [x] Store one active weekly or monthly budget per owned expense category and period.
- [x] Calculate current-period spending, including child spending in parent budgets and excluding deleted transactions.
- [x] Expose authenticated list, create, update and delete routes with origin and CSRF checks.
- [x] Load and edit budgets from signed-in screens while preserving the separate demo.
- [x] Cover ownership, validation, rollup, period boundaries, and soft-delete/recreate in tests.
- [x] Complete final frontend and API checks, including a signed-in browser flow against an isolated database.
