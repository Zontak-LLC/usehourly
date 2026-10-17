-- The colour and light/dark choice follow the account across devices (issue #32).
ALTER TABLE "auth_users" ADD COLUMN "theme_preset" TEXT;
ALTER TABLE "auth_users" ADD COLUMN "theme_mode" TEXT;
