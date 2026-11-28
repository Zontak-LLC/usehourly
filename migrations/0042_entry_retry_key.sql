-- A retry key on a time entry: an AI assistant that retries log_time with the same key gets the first entry back
-- instead of a second copy. One key per account (the partial unique index); entries without a key are not affected.
-- Additive and nullable with no default, so the old code keeps working on the new database (rollback-safe).
ALTER TABLE "time_entries" ADD COLUMN "retry_key" TEXT;
CREATE UNIQUE INDEX "time_entries_user_retry_key_idx" ON "time_entries" ("user_id", "retry_key") WHERE "retry_key" IS NOT NULL;
