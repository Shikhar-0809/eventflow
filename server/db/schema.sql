CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_name TEXT    NOT NULL,
  phone       TEXT    NOT NULL,
  event_type  TEXT    NOT NULL,
  event_date  TEXT    NOT NULL,
  guest_count INTEGER NOT NULL,
  venue       TEXT,
  advance     INTEGER DEFAULT 0,
  total       INTEGER DEFAULT 0,
  status      TEXT    DEFAULT 'confirmed',
  notes       TEXT,
  created_at  TEXT    DEFAULT NOW(),
  updated_at  TEXT    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS change_log (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id  INTEGER REFERENCES bookings(id),
  change_note TEXT    NOT NULL,
  logged_at   TEXT    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_log (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type  TEXT    NOT NULL,
  metadata    TEXT,
  created_at  TEXT    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name             TEXT    NOT NULL UNIQUE,
  total_quantity   INTEGER NOT NULL DEFAULT 0,
  damaged_quantity INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_inventory (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id  INTEGER NOT NULL REFERENCES bookings(id),
  item_id     INTEGER NOT NULL REFERENCES inventory_items(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS inventory_damage_log (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES inventory_items(id),
  change      INTEGER NOT NULL,
  note        TEXT,
  logged_at   TEXT    DEFAULT NOW()
);
