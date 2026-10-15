-- 006_email_otps: one-time email codes (signup, password reset, change email) and session invalidation.
-- Additive only: existing merchants keep every column value; the new merchants columns get safe defaults
-- (token_version 0 matches sessions issued before this migration, which carry no tv claim).
CREATE TABLE IF NOT EXISTS email_otps (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email        TEXT        NOT NULL,
  purpose      TEXT        NOT NULL,
  merchant_id  INTEGER,
  code_hash    TEXT        NOT NULL,
  attempts     INTEGER     NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_otps_purpose_check CHECK (purpose IN ('signup', 'reset', 'change_email')),
  CONSTRAINT email_otps_merchant_fkey FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS email_otps_email_purpose_idx ON email_otps (email, purpose);

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
