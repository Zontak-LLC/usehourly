-- Business details on the account (shown on invoices)
ALTER TABLE "auth_users" ADD COLUMN "business_name" TEXT;
ALTER TABLE "auth_users" ADD COLUMN "ein" TEXT;
ALTER TABLE "auth_users" ADD COLUMN "address" TEXT;
ALTER TABLE "auth_users" ADD COLUMN "logo" TEXT;

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT,
    "client_name" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issue_date" TEXT NOT NULL,
    "due_date" TEXT,
    "period_from" TEXT NOT NULL,
    "period_to" TEXT NOT NULL,
    "total_minutes" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "snapshot" TEXT NOT NULL,
    "search_text" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_user_id_number_key" ON "invoices"("user_id", "number");
CREATE INDEX "invoices_user_id_issue_date_idx" ON "invoices"("user_id", "issue_date");
