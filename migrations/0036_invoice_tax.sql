-- Tax on invoices (2026-10-23, issue #71 step 4): the name of the tax (VAT, GST, Sales tax), its rate in basis points
-- (hundredths of a percent: 2000 = 20%, null or 0 = no tax added) and the seller's tax number, printed on invoices.
-- Additive and nullable: old code never reads the columns, so a rollback of the code needs no change here.
ALTER TABLE "auth_users" ADD COLUMN "tax_name" TEXT;
ALTER TABLE "auth_users" ADD COLUMN "tax_rate" INTEGER;
ALTER TABLE "auth_users" ADD COLUMN "tax_number" TEXT;
