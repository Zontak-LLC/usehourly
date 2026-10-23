-- Which invoice an entry was billed on (null = not invoiced yet), so the same hours are never billed twice
-- (2026-10-23, issue #178). Deleting an invoice frees its entries again (ON DELETE SET NULL). Additive: old code
-- never reads the column, so a rollback of the code needs no change here.
ALTER TABLE "time_entries" ADD COLUMN "invoice_id" TEXT REFERENCES "invoices"("id") ON DELETE SET NULL;
CREATE INDEX "time_entries_user_id_invoice_id_idx" ON "time_entries"("user_id", "invoice_id");
-- The foreign key looks entries up by invoice alone when an invoice is deleted (ON DELETE SET NULL).
CREATE INDEX "time_entries_invoice_id_idx" ON "time_entries"("invoice_id");

-- Invoices made before this column existed kept no list of entries, only frozen lines. Mark as billed what such an
-- invoice must have covered: its client's billable entries inside its period that already existed when it was made
-- (the oldest invoice wins where two overlap). Entries logged later, or on non-billable projects, stay unbilled. Only the
-- rows that change are written: each write also logs a change for syncing devices (the trigger from migration 0032).
UPDATE "time_entries"
SET "invoice_id" = (
  SELECT i."id"
  FROM "invoices" i
  JOIN "projects" p ON p."id" = "time_entries"."project_id"
  WHERE i."user_id" = "time_entries"."user_id"
    AND i."client_id" = p."client_id"
    AND p."billable" = 1
    AND "time_entries"."date" BETWEEN i."period_from" AND i."period_to"
    AND "time_entries"."created_at" <= i."created_at"
  ORDER BY i."created_at" ASC
  LIMIT 1
)
WHERE "invoice_id" IS NULL
  AND "started_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "invoices" i
    JOIN "projects" p ON p."id" = "time_entries"."project_id"
    WHERE i."user_id" = "time_entries"."user_id"
      AND i."client_id" = p."client_id"
      AND p."billable" = 1
      AND "time_entries"."date" BETWEEN i."period_from" AND i."period_to"
      AND "time_entries"."created_at" <= i."created_at"
  );
