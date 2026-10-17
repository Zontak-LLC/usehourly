-- Issue #35 steps 2 and 3: an email address per client, and private links to an invoice.
ALTER TABLE "clients" ADD COLUMN "email" TEXT;

-- A private link a freelancer sends a client to view an invoice. Only the token's SHA-256 is stored;
-- the page shows the invoice's frozen snapshot.
CREATE TABLE "invoice_links" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "token_prefix" TEXT NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "revoked_at" INTEGER,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "invoice_links_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "invoice_links_token_hash_key" ON "invoice_links"("token_hash");
CREATE INDEX "invoice_links_invoice_id_idx" ON "invoice_links"("invoice_id");
CREATE INDEX "invoice_links_user_id_idx" ON "invoice_links"("user_id");
