-- Localisation step 2 (issue #71): a currency per client, and a currency on each invoice.
-- clients.currency NULL = "use the account's currency"; invoices.currency is the currency the invoice was issued in
-- (also frozen in the snapshot). Every invoice made so far was in its account's currency, so that is the backfill.
ALTER TABLE "clients" ADD COLUMN "currency" TEXT;
ALTER TABLE "invoices" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
UPDATE "invoices" SET "currency" = (SELECT "currency" FROM "auth_users" WHERE "auth_users"."id" = "invoices"."user_id");
