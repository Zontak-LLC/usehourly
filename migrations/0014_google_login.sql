-- Sign in with Google: the Google account id ("sub") an account is linked to.
ALTER TABLE "auth_users" ADD COLUMN "google_id" TEXT;
CREATE UNIQUE INDEX "auth_users_google_id_key" ON "auth_users"("google_id");
