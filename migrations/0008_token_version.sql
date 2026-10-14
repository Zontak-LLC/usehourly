-- Bumped when the password changes or the user signs out everywhere; a session whose token
-- carries an older number is no longer valid.
ALTER TABLE "auth_users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
