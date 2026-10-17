-- Timesheets shared with a client for sign-off (issue #34). `snapshot` is a frozen JSON copy of the hours
-- so the client approves exactly what they saw; only the token's SHA-256 is stored.
CREATE TABLE "timesheet_shares" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "token_prefix" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "period_from" TEXT NOT NULL,
  "period_to" TEXT NOT NULL,
  "snapshot" TEXT NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "revoked_at" INTEGER,
  "approved_name" TEXT,
  "approved_note" TEXT,
  "approved_at" INTEGER,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "timesheet_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "timesheet_shares_token_hash_key" ON "timesheet_shares"("token_hash");
CREATE INDEX "timesheet_shares_user_id_created_at_idx" ON "timesheet_shares"("user_id", "created_at");
