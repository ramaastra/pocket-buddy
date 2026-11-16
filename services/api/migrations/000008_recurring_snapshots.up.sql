-- Preserve the original calendar anchor and the values shown for each due item.
ALTER TABLE recurring_transactions ADD COLUMN anchor_date DATE;
UPDATE recurring_transactions SET anchor_date = next_occurrence;
ALTER TABLE recurring_transactions ALTER COLUMN anchor_date SET NOT NULL;
ALTER TABLE recurring_transactions ADD COLUMN description TEXT NOT NULL DEFAULT '';

ALTER TABLE recurring_occurrences ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE recurring_occurrences ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE recurring_occurrences ADD COLUMN kind TEXT CHECK (kind IN ('income', 'expense'));
ALTER TABLE recurring_occurrences ADD COLUMN amount BIGINT CHECK (amount > 0);
ALTER TABLE recurring_occurrences ADD COLUMN merchant TEXT NOT NULL DEFAULT '';
ALTER TABLE recurring_occurrences ADD COLUMN note TEXT NOT NULL DEFAULT '';
UPDATE recurring_occurrences AS o SET
    description = s.description, category_id = s.category_id, kind = s.kind,
    amount = s.amount, merchant = COALESCE(s.merchant, ''), note = COALESCE(s.note, '')
FROM recurring_transactions AS s WHERE s.id = o.recurring_transaction_id;
ALTER TABLE recurring_occurrences ALTER COLUMN kind SET NOT NULL;
ALTER TABLE recurring_occurrences ALTER COLUMN amount SET NOT NULL;
