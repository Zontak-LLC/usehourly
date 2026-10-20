-- Localisation step 1 (issue #71): one currency per account. Money stays integer minor units (cents); only the
-- symbol and format change. Locked in the application once the account has an invoice.
ALTER TABLE "auth_users" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
