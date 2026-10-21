-- Which OAuth app a token belongs to (null for tokens made by hand on the Account page). Connecting an app again
-- replaces that app's earlier token by this id, not by its display name (two apps can choose the same name).
ALTER TABLE "api_tokens" ADD COLUMN "oauth_client_id" TEXT;
CREATE INDEX "api_tokens_user_id_oauth_client_id_idx" ON "api_tokens"("user_id", "oauth_client_id");
