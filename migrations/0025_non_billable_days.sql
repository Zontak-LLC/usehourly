-- Days an account has marked non-billable (a holiday, an unpaid day, work for yourself). One row per account and date.
-- Invoices, exports and the year summary skip time on these dates; the entries themselves are never changed.
CREATE TABLE IF NOT EXISTS "non_billable_days" (
  "user_id" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id", "date"),
  CONSTRAINT "non_billable_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
