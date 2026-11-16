ALTER TABLE categories DROP CONSTRAINT categories_user_id_parent_id_name_kind_key;
CREATE UNIQUE INDEX categories_active_user_kind_idx ON categories (user_id, kind, lower(name)) WHERE deleted_at IS NULL;
