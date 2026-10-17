-- Sign in with GitHub: the GitHub account id an account is linked to.
ALTER TABLE "auth_users" ADD COLUMN "github_id" TEXT;
CREATE UNIQUE INDEX "auth_users_github_id_key" ON "auth_users"("github_id");
