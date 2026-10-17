-- Email addresses that bounced for good or complained (Resend webhook): we stop mailing them (issue #33).
ALTER TABLE "auth_users" ADD COLUMN "email_bounced_at" DATETIME;
