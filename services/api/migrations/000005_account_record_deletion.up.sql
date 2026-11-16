ALTER TABLE categories ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE budgets ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE recurring_transactions ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE recurring_occurrences ADD COLUMN deleted_at TIMESTAMPTZ;
UPDATE transactions t SET deleted_at = u.deleted_at, purge_at = u.deleted_at + interval '30 days'
FROM users u WHERE t.user_id = u.id AND u.deleted_at IS NOT NULL AND t.deleted_at IS NULL;
UPDATE categories r SET deleted_at = u.deleted_at FROM users u WHERE r.user_id = u.id AND u.deleted_at IS NOT NULL;
UPDATE budgets r SET deleted_at = u.deleted_at FROM users u WHERE r.user_id = u.id AND u.deleted_at IS NOT NULL;
UPDATE recurring_transactions r SET deleted_at = u.deleted_at FROM users u WHERE r.user_id = u.id AND u.deleted_at IS NOT NULL;
UPDATE recurring_occurrences r SET deleted_at = u.deleted_at FROM users u WHERE r.user_id = u.id AND u.deleted_at IS NOT NULL;
