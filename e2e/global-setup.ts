import { migrationsApplied } from "./local-db";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

/** Start every run with an empty screenshot folder, so the report never mixes in pictures from an older run. */
export default async function globalSetup() {
  rmSync("e2e/report/screens", { recursive: true, force: true });
  // The test copy of the app has its own database folder: bring it up to date with the migrations. The web server
  // (e2e/start-app.mjs) already applies them while the app builds, so this is only needed for a dev server or a reused
  // one, and is skipped when the database is up to date (starting Wrangler just to hear "nothing to do" takes seconds).
  const persist = process.env.E2E_PERSIST;
  if (persist && !process.env.E2E_BASE_URL && !migrationsApplied(persist)) {
    execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", persist], {
      stdio: "pipe",
    });
  }
  // Warm up the pages everyone starts on, once, so several workers do not all wait for the first compile of the same
  // route at the same moment (the test copy of the app compiles a page the first time it is asked for).
  if (!process.env.E2E_BASE_URL) {
    const base = `http://localhost:${process.env.E2E_PORT ?? 3029}`;
    await Promise.allSettled(
      ["/", "/auth/v2/login", "/auth/v2/register", "/help", "/privacy"].map((path) =>
        fetch(base + path, { signal: AbortSignal.timeout(90_000) }).then((r) => r.text()),
      ),
    );
  }
}
