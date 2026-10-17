-- Try-the-demo accounts, the optional "Made with UseHourly" invoice line, and the weekly reminder email.
ALTER TABLE "auth_users" ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "auth_users" ADD COLUMN "invoice_branding" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "auth_users" ADD COLUMN "weekly_reminder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "auth_users" ADD COLUMN "timezone" TEXT;
ALTER TABLE "auth_users" ADD COLUMN "reminder_sent_week" TEXT;
CREATE INDEX "auth_users_is_demo_created_at_idx" ON "auth_users"("is_demo", "created_at");
