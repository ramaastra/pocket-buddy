ALTER TABLE recurring_occurrences DROP COLUMN note, DROP COLUMN merchant,
    DROP COLUMN amount, DROP COLUMN kind, DROP COLUMN category_id, DROP COLUMN description;
ALTER TABLE recurring_transactions DROP COLUMN description, DROP COLUMN anchor_date;
