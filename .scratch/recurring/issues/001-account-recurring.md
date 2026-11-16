# 001: Connect recurring schedules to accounts

Status: implemented and locally verified.

- Store user-owned schedules and generate due occurrence snapshots.
- Support schedule changes, pausing, resuming and deletion.
- Let users edit and confirm a pending occurrence or skip it.
- Validate category ownership and kind, and prevent duplicate confirmation.
- Verify calendar boundaries, ownership and the signed-in browser flow against an isolated database.
