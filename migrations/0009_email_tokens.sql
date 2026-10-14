-- One-time links sent by email: confirm an address ("verify") or choose a new password ("reset").
-- Only a hash of the token is stored, so a database leak cannot be turned into working links.
ALTER TABLE "auth_users" ADD COLUMN "email_verified_at" DATETIME;

CREATE TABLE "email_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" INTEGER NOT NULL,
    "used_at" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");
CREATE INDEX "email_tokens_user_id_kind_idx" ON "email_tokens"("user_id", "kind");
