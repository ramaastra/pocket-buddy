ALTER TABLE budgets DROP CONSTRAINT budgets_user_id_category_id_period_key;
CREATE UNIQUE INDEX budgets_active_identity_idx ON budgets(user_id, category_id, period) WHERE deleted_at IS NULL;
