-- 005_merchant_accounts: merchants can sign up and log in with an email and password.
-- Both columns are nullable: rows created before this migration (merchant 1) have no credentials.
-- A merchant without a password_hash cannot log in until credentials are set for it.
ALTER TABLE merchants ADD COLUMN email TEXT;
ALTER TABLE merchants ADD COLUMN password_hash TEXT;

-- Emails are stored lowercased; the index also makes case-different duplicates impossible.
CREATE UNIQUE INDEX merchants_email_lower_key ON merchants (lower(email));
