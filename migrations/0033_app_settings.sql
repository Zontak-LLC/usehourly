-- Settings that belong to the whole app, not to a person (issue: a "chip in" notice the owner can switch on if hosting gets expensive).
CREATE TABLE "app_settings" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
