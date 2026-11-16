# Account-backed budgets

Signed-in users can create, inspect, update a limit, and remove weekly or monthly expense budgets. A budget targets an active expense parent or child category. The API owns validation, user scope, storage and current-period spending. Weeks start Monday. Parent spending includes direct child categories; parent and child budgets are separate plans. Deleted transactions do not count. The unsigned browser-local demo remains separate.

Budget list and overview use the current period's spending. The list summary counts plans rather than adding weekly, monthly, parent and child figures together. Removal soft-deletes the budget and leaves transactions intact.
