-- Change log for local-first sync (issue #95). Every insert, update and delete on time_entries leaves one row here,
-- written by the database itself, so EVERY write path is covered (the app, the AI assistant tools, imports, merges, a
-- project's delete cascading to its entries). A device remembers the last `seq` it saw and asks for what came after.
-- It records only WHICH entry changed; the pull looks the entry up (still there = send it, gone = tell the device to
-- remove it), so a delete followed by a re-create can never confuse a device. user_id is the entry's owner.
-- No foreign key on purpose: deleting an account cascades to its entries, whose delete trigger would insert rows that
-- point at an account being removed. Old rows are swept by housekeeping.
CREATE TABLE IF NOT EXISTS "entry_changes" (
  "seq" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "user_id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "at" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "entry_changes_user_seq" ON "entry_changes" ("user_id", "seq");
CREATE INDEX IF NOT EXISTS "entry_changes_at" ON "entry_changes" ("at");

CREATE TRIGGER IF NOT EXISTS "time_entries_log_insert" AFTER INSERT ON "time_entries"
BEGIN
  INSERT INTO "entry_changes" ("user_id", "entry_id") VALUES (NEW."user_id", NEW."id");
END;

CREATE TRIGGER IF NOT EXISTS "time_entries_log_update" AFTER UPDATE ON "time_entries"
BEGIN
  INSERT INTO "entry_changes" ("user_id", "entry_id") VALUES (NEW."user_id", NEW."id");
END;

CREATE TRIGGER IF NOT EXISTS "time_entries_log_delete" AFTER DELETE ON "time_entries"
BEGIN
  INSERT INTO "entry_changes" ("user_id", "entry_id") VALUES (OLD."user_id", OLD."id");
END;
