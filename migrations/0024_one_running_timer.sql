-- At most one running timer per account, enforced by the database. Two "start" requests at the same moment (a
-- double-click, or the app and an AI assistant together) could each see "no timer running" and each create one;
-- with this partial unique index (only rows that have a start time count) the second is refused and the app turns
-- that into a plain message. Checked on 2026-10-18: no account had two running timers, so this applies cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_one_running_per_user" ON "time_entries" ("user_id") WHERE "started_at" IS NOT NULL;
