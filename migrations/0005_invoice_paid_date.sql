-- When an invoice was paid (YYYY-MM-DD); null = unpaid
ALTER TABLE "invoices" ADD COLUMN "paid_date" TEXT;
CREATE INDEX "invoices_user_id_paid_date_idx" ON "invoices"("user_id", "paid_date");
