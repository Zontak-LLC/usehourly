-- Page views per day, counted without any user id (issue #37). One row per (day, page).
CREATE TABLE "usage_daily" (
  "day" TEXT NOT NULL,
  "page" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("day", "page")
);
