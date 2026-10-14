-- Fixed-window counters for throttling sign-in and register (key = "kind:subject").
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0,
    "reset_at" INTEGER NOT NULL
);
