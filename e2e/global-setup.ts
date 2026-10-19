import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

/** Start every run with an empty screenshot folder, so the report never mixes in pictures from an older run. */
export default function globalSetup() {
  rmSync("e2e/report/screens", { recursive: true, force: true });
  // The test copy of the app has its own database folder: bring it up to date with the migrations (a no-op once done).
  const persist = process.env.E2E_PERSIST;
  if (persist && !process.env.E2E_BASE_URL) {
    execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", persist], {
      stdio: "pipe",
    });
  }
}
