CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS change_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id  INTEGER REFERENCES bookings(id),
  change_note TEXT    NOT NULL,
  logged_at   TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT    NOT NULL,
  metadata    TEXT,
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL UNIQUE,
  total_quantity   INTEGER NOT NULL DEFAULT 0,
  damaged_quantity INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking_inventory (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id  INTEGER NOT NULL REFERENCES bookings(id),
  item_id     INTEGER NOT NULL REFERENCES inventory_items(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS inventory_damage_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL REFERENCES inventory_items(id),
  change      INTEGER NOT NULL,
  note        TEXT,
  logged_at   TEXT    DEFAULT (datetime('now'))
);
