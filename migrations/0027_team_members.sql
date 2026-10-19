-- Delegated access (issue #68): a team member logs time on the clients an owner granted them.
-- time_entries.author_id = who typed an entry (null = the account's owner); a member's entries belong to the owner.
ALTER TABLE "time_entries" ADD COLUMN "author_id" TEXT REFERENCES "auth_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "time_entries_author_id_idx" ON "time_entries" ("author_id");

CREATE TABLE IF NOT EXISTS "team_members" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "owner_id" TEXT NOT NULL,
  "member_id" TEXT,
  "email" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "token_hash" TEXT,
  "expires_at" INTEGER,
  "accepted_at" INTEGER,
  "revoked_at" INTEGER,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_members_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "team_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "auth_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_token_hash_key" ON "team_members" ("token_hash");
CREATE INDEX IF NOT EXISTS "team_members_owner_id_idx" ON "team_members" ("owner_id");
CREATE INDEX IF NOT EXISTS "team_members_member_id_idx" ON "team_members" ("member_id");

CREATE TABLE IF NOT EXISTS "team_member_clients" (
  "team_member_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  PRIMARY KEY ("team_member_id", "client_id"),
  CONSTRAINT "team_member_clients_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "team_member_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
