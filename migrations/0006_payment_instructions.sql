-- How to pay, printed on invoices (free text: ACH, check, Zelle...)
ALTER TABLE "auth_users" ADD COLUMN "payment_instructions" TEXT;
