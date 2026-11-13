# Domain documentation

This is a single-context application. Keep the shared domain vocabulary in [`../product.md`](../product.md) until a dedicated root `GLOSSARY.md` becomes useful. Record durable technical choices in [`../adr/`](../adr/).

Before changing domain behavior, read the product brief and relevant ADRs. Keep `kind` (income/expense) distinct from optional category; uncategorized transactions remain valid. Budgets apply to expenses and do not themselves change available cash.
