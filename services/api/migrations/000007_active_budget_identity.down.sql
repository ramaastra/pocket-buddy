DROP INDEX budgets_active_identity_idx;
ALTER TABLE budgets ADD CONSTRAINT budgets_user_id_category_id_period_key UNIQUE(user_id, category_id, period);
