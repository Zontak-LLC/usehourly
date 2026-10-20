-- Performance: covering indexes for the per-project sums (project totals and budgets). With every column the query
-- needs in the index, SQLite answers "minutes per project" from the index alone instead of reading entry rows:
--  - all time:            (user_id, project_id, date, minutes)
--  - inside a date range: (user_id, date, project_id, minutes), which replaces the old (user_id, date) index and
--                         still serves every date-range read of entries.
CREATE INDEX IF NOT EXISTS "time_entries_user_id_project_id_date_minutes_idx" ON "time_entries" ("user_id", "project_id", "date", "minutes");
CREATE INDEX IF NOT EXISTS "time_entries_user_id_date_project_id_minutes_idx" ON "time_entries" ("user_id", "date", "project_id", "minutes");
DROP INDEX IF EXISTS "time_entries_user_id_date_idx";
