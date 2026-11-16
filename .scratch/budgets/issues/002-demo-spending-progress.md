# 002: Recalculate demo budget spending

Status: fixed and locally verified.

Adding a current-week Pertalite expense to Transport left the demo's weekly Transport budget unchanged because the UI displayed a stored sample `spent` value. The demo now calculates current-period spending from its active transactions, including direct child categories for parent budgets. A browser repro covers transaction entry through the budget list; unit tests cover period boundaries, income exclusion, and parent/child behavior.
