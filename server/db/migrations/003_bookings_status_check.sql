-- 003_bookings_status_check: make sure bookings.status is constrained at the database level.
-- 001_baseline declares this CHECK, but databases created before it was added to the old schema.sql
-- (including production and the first dev database) never got it: CREATE TABLE IF NOT EXISTS does not
-- alter an existing table. Fresh databases already have it from 001, so only add it when it is missing.
-- NOT VALID then VALIDATE: the constraint is attached first and the existing rows are checked afterwards.
-- If a row ever held an invalid status, VALIDATE fails and the whole migration rolls back.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND conname = 'bookings_status_check'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_status_check
      CHECK (status IN ('confirmed', 'pending', 'cancelled', 'completed')) NOT VALID;
    ALTER TABLE bookings VALIDATE CONSTRAINT bookings_status_check;
  END IF;
END $$;
