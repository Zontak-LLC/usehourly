-- Expenses and mileage (2026-10-23, issue #100 first slice): money spent for the business, for the year summary.
-- A new table only (additive): old code never reads it, so a rollback of the code needs no change here.
CREATE TABLE IF NOT EXISTS "expenses" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'expense',
  "category" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "note" TEXT,
  "client_id" TEXT,
  "distance" INTEGER,
  "distance_unit" TEXT,
  "mileage_rate" INTEGER,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "expenses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "expenses_user_id_date_idx" ON "expenses" ("user_id", "date");
