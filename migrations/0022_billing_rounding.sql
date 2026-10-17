-- Issue #36: per-client billing rounding. Applied only when an invoice is built; entries are never changed.
ALTER TABLE "clients" ADD COLUMN "round_step" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "clients" ADD COLUMN "round_mode" TEXT NOT NULL DEFAULT 'up';
ALTER TABLE "clients" ADD COLUMN "round_min" INTEGER NOT NULL DEFAULT 0;
