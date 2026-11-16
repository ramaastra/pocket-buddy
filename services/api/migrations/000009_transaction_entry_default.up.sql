ALTER TABLE users
    ADD COLUMN transaction_entry_default TEXT NOT NULL DEFAULT 'manual'
    CHECK (transaction_entry_default IN ('manual', 'scan'));
