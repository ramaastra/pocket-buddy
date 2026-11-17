# Fractional currency support

## Goal

Support IDR, USD, SGD, and AUD throughout account and demo screens while keeping financial values as safe integer minor units.

## Behavior

- IDR uses zero decimal places; USD, SGD, and AUD use two.
- Amount entry groups whole digits, accepts the currency's fractional digits, and converts exactly to minor units without floating-point storage or arithmetic.
- Amounts display with the selected currency's symbol and appropriate fraction digits in transactions, budgets, recurring records, dashboard totals, extraction drafts, and settings.
- Changing display currency relabels existing integer values without conversion and warns the user, as specified in the product brief.
- API settings accept only the supported currency set; extraction interprets and returns values in the account currency's minor units.
- CSV continues to export the stored integer minor-unit amount and currency code.
