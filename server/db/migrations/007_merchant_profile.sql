-- 007_merchant_profile: merchant profile page (recent sign-ins, change-email / in-session reset codes).
-- merchants.business_name already exists (created in 002_multi_merchant), so it is not added here.
-- Additive: a CHECK on the existing whatsapp_phone column (002), one new table, and a WIDENED CHECK on email_otps.purpose (existing rows still pass).
-- The merchant's own number (merchants.whatsapp_phone, created in 002) is edited on the profile page.
-- Same rule as a booking's phone. Existing rows are validated when the constraint is added, so a bad stored value would fail this migration.
ALTER TABLE merchants
  ADD CONSTRAINT merchants_whatsapp_phone_check CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^[6-9][0-9]{9}$');

-- Coarse device label only ("Chrome on Android"). The IP address and the full user agent are never stored.
CREATE TABLE IF NOT EXISTS sign_in_log (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  merchant_id  INTEGER     NOT NULL REFERENCES merchants (id),
  device_label TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sign_in_log_merchant_created_idx ON sign_in_log (merchant_id, created_at DESC);

-- reset_password: the in-session "reset by email code" flow (kept apart from the logged-out 'reset' flow).
ALTER TABLE email_otps DROP CONSTRAINT IF EXISTS email_otps_purpose_check;
ALTER TABLE email_otps
  ADD CONSTRAINT email_otps_purpose_check CHECK (purpose IN ('signup', 'reset', 'change_email', 'reset_password'));
