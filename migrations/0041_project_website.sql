-- A project's website (2026-11-06): the full address checked by parseWebsite (src/lib/web-address.ts), null = none.
-- Additive and nullable with no default, so the old code keeps working on the new database (rollback-safe).
ALTER TABLE "projects" ADD COLUMN "website" TEXT;
