-- A picture next to the person's name in the top bar (a small png/jpeg data URL resized in the browser, like logos).
ALTER TABLE "auth_users" ADD COLUMN "avatar" TEXT;
