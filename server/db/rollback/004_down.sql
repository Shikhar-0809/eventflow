-- 004_down: undo 004_drop_merchant_defaults by restoring the DEFAULT 1 on every merchant_id column.
--
-- NOT run automatically. It lives in db/rollback/, which the migration runner never reads. Run it BY HAND
-- (Neon SQL editor, against the right database) only when rolling back push (b), see RUNBOOK.md.
--
-- The defaults restored here are exactly the ones migration 002 set and 004 removed: DEFAULT 1 on the
-- merchant_id column of these eight tables. They were checked against the schema produced by actually executing
-- 001 + 002 + 003 (see RUNBOOK.md, "Release rollback").
--
-- It also forgets that 004 was applied, so the next deploy applies 004 again instead of skipping it.
-- Roll the CODE back to the previous release as well (the old code relies on these defaults, the scoped code does not).

BEGIN;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bookings', 'change_log', 'booking_inventory', 'inventory_items',
    'inventory_damage_log', 'booking_expenses', 'event_log', 'merchant_settings'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN merchant_id SET DEFAULT 1', t);
  END LOOP;
END $$;

DELETE FROM schema_migrations WHERE id = '004_drop_merchant_defaults';

COMMIT;
