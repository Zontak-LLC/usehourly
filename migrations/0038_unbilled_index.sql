-- Performance: "not invoiced yet" (invoice.unbilled, behind Clients, the bill bar and the invoice builder) summed every
-- entry the account ever logged, reading each row to check invoice_id and started_at, so it grew with the whole history.
-- This partial index holds only stopped, unbilled entries and every column the sum needs, so SQLite answers it from the
-- index alone and reads only the time still waiting to be billed. Additive: old code keeps working on the new database.
-- Prisma's schema cannot declare a partial index, so it lives here only (like time_entries_one_running_per_user).
CREATE INDEX IF NOT EXISTS "time_entries_unbilled_idx" ON "time_entries" ("user_id", "project_id", "date", "minutes", "invoice_id", "started_at")
WHERE "invoice_id" IS NULL AND "started_at" IS NULL;
