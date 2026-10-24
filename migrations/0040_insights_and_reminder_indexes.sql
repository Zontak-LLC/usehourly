-- Performance (issue 180 stress test, 10,000 accounts and 2.6 million entries on staging).
-- Insights (owner only) scanned every entry four times (first entry per account, entries made in the last 30 days,
-- accounts active in the last 7 and 30 days): about 2.9 seconds. It now asks per account, and each question is one
-- short seek in one of these two indexes, so the cost follows the number of accounts, not the number of entries.
-- Each adds one written row per entry insert or edit, which is why there are two and not four.
CREATE INDEX IF NOT EXISTS "time_entries_user_created_idx" ON "time_entries" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "time_entries_user_updated_idx" ON "time_entries" ("user_id", "updated_at");

-- The hourly overdue-reminder run (server/invoice-reminders.ts) read every invoice row, frozen snapshot included, to find
-- the few unpaid ones with reminders on (about 1 second cold at 67,000 invoices). This partial index holds only those
-- and every column the query reads, so SQLite answers it from the index alone. Prisma's schema cannot declare a partial
-- index, so it lives here only (like time_entries_unbilled_idx). Additive: old code keeps working on the new database.
CREATE INDEX IF NOT EXISTS "invoices_overdue_idx" ON "invoices" ("id", "due_date", "reminders_sent", "user_id", "paid_date")
WHERE "remind_overdue" = 1 AND "paid_date" IS NULL;
