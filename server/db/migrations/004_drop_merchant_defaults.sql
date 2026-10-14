-- 004_drop_merchant_defaults: remove the temporary DEFAULT 1 from every merchant_id column.
-- Migration 002 kept the default so the not-yet-scoped routes kept working. Every route and script now sets
-- merchant_id explicitly, so from here on a query that forgets it fails with a NOT NULL error instead of
-- silently writing to merchant 1.
-- Release note: ship this in a separate push AFTER the merchant-scoped code is live (see DEPLOYMENT.md),
-- so no running instance still relies on the default.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bookings', 'change_log', 'booking_inventory', 'inventory_items',
    'inventory_damage_log', 'booking_expenses', 'event_log', 'merchant_settings'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN merchant_id DROP DEFAULT', t);
  END LOOP;
END $$;
