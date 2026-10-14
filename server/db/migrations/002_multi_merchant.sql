-- 002_multi_merchant: every business table belongs to a merchant.
-- Existing data becomes merchant 1. Cross-merchant links are made impossible by composite FKs.
-- NOTE: merchant_id DEFAULT 1 below is TEMPORARY so the not-yet-scoped route code keeps working.
-- The next migration (with the merchant-scoped routes) removes those defaults.

CREATE TABLE merchants (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_name  TEXT,
  owner_name     TEXT,
  whatsapp_phone TEXT,
  city           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO merchants (id, business_name, owner_name)
OVERRIDING SYSTEM VALUE
VALUES (1, 'Bala Ji Tent House', 'Bharat');

ALTER TABLE merchants ALTER COLUMN id RESTART WITH 2;

-- merchant_id: add, backfill with merchant 1, make required, link to merchants.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bookings', 'change_log', 'booking_inventory', 'inventory_items',
    'inventory_damage_log', 'booking_expenses', 'event_log', 'merchant_settings'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN merchant_id INTEGER', t);
    EXECUTE format('UPDATE %I SET merchant_id = 1', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN merchant_id SET NOT NULL', t);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (merchant_id) REFERENCES merchants (id)',
      t, t || '_merchant_id_fkey'
    );
    -- TEMPORARY: removed when the routes are scoped to req.merchantId.
    EXECUTE format('ALTER TABLE %I ALTER COLUMN merchant_id SET DEFAULT 1', t);
  END LOOP;
END $$;

-- Uniqueness. Constraints are found in the catalog rather than by assumed name.
DO $$
DECLARE
  r RECORD;
BEGIN
  -- inventory_items: the global UNIQUE (name) becomes per merchant.
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'inventory_items'::regclass
      AND c.contype = 'u'
      AND c.conkey = ARRAY[(
        SELECT a.attnum FROM pg_attribute a
        WHERE a.attrelid = 'inventory_items'::regclass AND a.attname = 'name'
      )]
  LOOP
    EXECUTE format('ALTER TABLE inventory_items DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- merchant_settings: PRIMARY KEY (key) becomes PRIMARY KEY (merchant_id, key).
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'merchant_settings'::regclass AND c.contype = 'p'
  LOOP
    EXECUTE format('ALTER TABLE merchant_settings DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_merchant_id_name_key UNIQUE (merchant_id, name);
ALTER TABLE merchant_settings ADD PRIMARY KEY (merchant_id, key);

-- Needed as targets for the composite foreign keys below.
ALTER TABLE bookings ADD CONSTRAINT bookings_id_merchant_id_key UNIQUE (id, merchant_id);
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_id_merchant_id_key UNIQUE (id, merchant_id);

-- Drop the old single-column foreign keys (found by what they link, not by name).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS child, c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND array_length(c.conkey, 1) = 1
      AND (c.conrelid::regclass::text, a.attname::text, c.confrelid::regclass::text) IN (
        VALUES
          ('change_log', 'booking_id', 'bookings'),
          ('booking_expenses', 'booking_id', 'bookings'),
          ('booking_inventory', 'booking_id', 'bookings'),
          ('booking_inventory', 'item_id', 'inventory_items'),
          ('inventory_damage_log', 'item_id', 'inventory_items')
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.child, r.conname);
  END LOOP;
END $$;

-- A child row can only point at a parent of the same merchant.
ALTER TABLE change_log
  ADD CONSTRAINT change_log_booking_merchant_fkey
  FOREIGN KEY (booking_id, merchant_id) REFERENCES bookings (id, merchant_id) ON DELETE CASCADE;

ALTER TABLE booking_expenses
  ADD CONSTRAINT booking_expenses_booking_merchant_fkey
  FOREIGN KEY (booking_id, merchant_id) REFERENCES bookings (id, merchant_id) ON DELETE CASCADE;

ALTER TABLE booking_inventory
  ADD CONSTRAINT booking_inventory_booking_merchant_fkey
  FOREIGN KEY (booking_id, merchant_id) REFERENCES bookings (id, merchant_id) ON DELETE CASCADE;

ALTER TABLE booking_inventory
  ADD CONSTRAINT booking_inventory_item_merchant_fkey
  FOREIGN KEY (item_id, merchant_id) REFERENCES inventory_items (id, merchant_id);

ALTER TABLE inventory_damage_log
  ADD CONSTRAINT inventory_damage_log_item_merchant_fkey
  FOREIGN KEY (item_id, merchant_id) REFERENCES inventory_items (id, merchant_id);

-- Indexes.
CREATE INDEX IF NOT EXISTS bookings_merchant_event_date_idx ON bookings (merchant_id, event_date);
CREATE INDEX IF NOT EXISTS inventory_items_merchant_idx ON inventory_items (merchant_id);
CREATE INDEX IF NOT EXISTS event_log_merchant_created_at_idx ON event_log (merchant_id, created_at);
CREATE INDEX IF NOT EXISTS change_log_booking_idx ON change_log (booking_id);
CREATE INDEX IF NOT EXISTS booking_inventory_booking_idx ON booking_inventory (booking_id);
CREATE INDEX IF NOT EXISTS booking_inventory_item_idx ON booking_inventory (item_id);
CREATE INDEX IF NOT EXISTS booking_expenses_booking_idx ON booking_expenses (booking_id);
CREATE INDEX IF NOT EXISTS inventory_damage_log_item_idx ON inventory_damage_log (item_id);
