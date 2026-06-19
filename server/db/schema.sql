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
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS change_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id  INTEGER REFERENCES bookings(id),
  change_note TEXT    NOT NULL,
  logged_at   TEXT    DEFAULT (datetime('now'))
);
