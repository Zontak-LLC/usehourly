-- Issue #35 step 4: emailing an invoice link to a client, optional overdue reminders, and a stop list.
-- Addresses that asked to stop (or bounced) are never mailed again, whoever asks.
CREATE TABLE "email_suppressions" (
  "email" TEXT NOT NULL PRIMARY KEY,
  "reason" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One row per email sent about an invoice: the history on the invoice, and what the daily limits count.
CREATE TABLE "invoice_emails" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "to_email" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "invoice_emails_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "invoice_emails_invoice_id_created_at_idx" ON "invoice_emails"("invoice_id", "created_at");
CREATE INDEX "invoice_emails_user_id_idx" ON "invoice_emails"("user_id");

-- Opt-in overdue reminders on an invoice: how many have gone out (at most two).
ALTER TABLE "invoices" ADD COLUMN "remind_overdue" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "invoices" ADD COLUMN "reminders_sent" INTEGER NOT NULL DEFAULT 0;
