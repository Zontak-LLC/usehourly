-- A one-line summary of the work on each invoice, shown on the invoice cards. Filled when an invoice is
-- made; older invoices (empty) are filled the first time the history is opened.
ALTER TABLE "invoices" ADD COLUMN "summary" TEXT NOT NULL DEFAULT '';
