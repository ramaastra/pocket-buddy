# 001: Support fractional currency amounts

Status: implemented and locally verified.

- [x] Allow USD, SGD, and AUD in account settings while preserving IDR.
- [x] Render integer minor-unit amounts using the selected currency exponent and symbol.
- [x] Add decimal-capable amount input with exact string-to-minor-unit conversion.
- [x] Pass the selected currency through every transaction, budget, recurring, and opening-balance form.
- [x] Make extraction prompt and interpretation currency-aware.
- [x] Warn before relabeling existing values when changing currency.
- [x] Update implementation status and API docs.
- [x] Run targeted frontend tests, TypeScript checking, production build, and Go tests.
- [x] Review the settings flow in a local browser, including currency-change confirmation and exact minor-unit persistence.
