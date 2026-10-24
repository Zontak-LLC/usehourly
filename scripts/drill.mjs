// Starts, stops or shows a drill on STAGING (see src/lib/drill.ts): one thing breaks on purpose so Night Watch can be
// seen to catch it, and it undoes itself after the minutes given (10 by default, 15 at most).
//
//   node scripts/drill.mjs status
//   node scripts/drill.mjs start health-503 [minutes]
//   node scripts/drill.mjs stop
//
// The token is read from the macOS Keychain (`~/.claude/bin/secret-get usehourly-staging-drill-token`) and never
// printed. DRILL_URL overrides the address (staging only: production answers 404 whatever is sent).
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.env.DRILL_URL ?? "https://staging.usehourly.app";
const [cmd, fault, minutesText] = process.argv.slice(2);

const usage = () => {
  console.error("Usage: node scripts/drill.mjs status | start <fault> [minutes] | stop");
  console.error("Faults: health-503, health-slow, entry-list-500");
  process.exit(2);
};

if (!["status", "start", "stop"].includes(cmd ?? "")) usage();
if (cmd === "start" && !fault) usage();

let token;
try {
  token = execFileSync(join(homedir(), ".claude/bin/secret-get"), ["usehourly-staging-drill-token"], {
    encoding: "utf8",
  }).trim();
} catch {
  console.error('No token in the Keychain under "usehourly-staging-drill-token". See docs/operations.md, "Drills".');
  process.exit(1);
}

const body =
  cmd === "start"
    ? { action: "start", fault, ...(minutesText ? { minutes: Number(minutesText) } : {}) }
    : cmd === "stop"
      ? { action: "stop" }
      : null;
const res = await fetch(`${BASE}/api/drill`, {
  method: body ? "POST" : "GET",
  headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
if (res.status === 404) {
  console.error("404: the drill switch is off there (not staging, or DRILL_TOKEN is not set on the Worker).");
  process.exit(1);
}
const text = await res.text();
console.log(`${res.status} ${text}`);
process.exit(res.ok ? 0 : 1);
