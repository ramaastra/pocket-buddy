DROP INDEX categories_active_user_kind_idx;
ALTER TABLE categories ADD CONSTRAINT categories_user_id_parent_id_name_kind_key UNIQUE (user_id, parent_id, name, kind);
