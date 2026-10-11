-- Client billing address and logo, printed on invoices
ALTER TABLE "clients" ADD COLUMN "legal_name" TEXT;
ALTER TABLE "clients" ADD COLUMN "address" TEXT;
ALTER TABLE "clients" ADD COLUMN "logo" TEXT;
