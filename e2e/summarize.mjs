// Turns the last Playwright run (e2e/report/results.json) into e2e/report/summary.md: what passed and failed, how many
// actions each job took, the advice the page checks gave (small tap targets and the like), and where the screenshots are.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const file = "e2e/report/results.json";
if (!existsSync(file)) {
  console.error("No results yet: run `npm run e2e` first.");
  process.exit(1);
}
const results = JSON.parse(readFileSync(file, "utf8"));
const rows = [];
const advice = new Map(); // "device|page|text" -> true
const effort = [];

const walk = (suite) => {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const r = t.results?.at(-1);
      const status = r?.status ?? "unknown";
      const errors = (r?.errors ?? []).map((e) =>
        (e.message ?? "")
          .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "")
          .split("\n")
          .slice(0, 6)
          .join(" | "),
      );
      rows.push({ project: t.projectName, title: spec.title, status, errors });
      for (const a of t.annotations ?? []) {
        if (a.type.startsWith("advice:")) advice.set(`${t.projectName}|${a.type.slice(8)}|${a.description}`, true);
        if (a.type === "effort") effort.push({ project: t.projectName, ...JSON.parse(a.description) });
      }
    }
  }
  for (const s of suite.suites ?? []) walk(s);
};
for (const s of results.suites ?? []) walk(s);

const passed = rows.filter((r) => r.status === "passed").length;
const skipped = rows.filter((r) => r.status === "skipped").length;
const failed = rows.filter((r) => r.status !== "passed" && r.status !== "skipped");
const lines = [`# Site test summary`, ``, `${passed} of ${rows.length - skipped} tests passed${skipped ? ` (${skipped} skipped on purpose)` : ""}.`, ``];
if (failed.length) {
  lines.push(`## Failures`, ``);
  for (const f of failed)
    lines.push(`- **[${f.project}] ${f.title}** (${f.status})`, ...f.errors.map((e) => `  - ${e}`));
  lines.push(``);
}
if (effort.length) {
  lines.push(`## Effort (actions a person has to take)`, ``);
  for (const e of effort)
    lines.push(
      `- ${e.project}: sign up ${e.signup}, from sign-up to first entry ${e.firstEntry}, make an invoice ${e.invoice}`,
    );
  lines.push(``);
}
if (advice.size) {
  lines.push(`## Advice from the page checks (not failures)`, ``);
  for (const k of advice.keys()) {
    const [project, page, text] = k.split("|");
    lines.push(`- [${project}] ${page}: ${text}`);
  }
  lines.push(``);
}
const shots = ["desktop", "phone"].flatMap((d) =>
  existsSync(`e2e/report/screens/${d}`)
    ? readdirSync(`e2e/report/screens/${d}`).map((f) => `e2e/report/screens/${d}/${f}`)
    : [],
);
lines.push(`## Screenshots (${shots.length})`, ``, ...shots.map((s) => `- ${s}`), ``);
writeFileSync("e2e/report/summary.md", lines.join("\n"));
console.log(lines.slice(0, 4).join("\n"));
console.log(`Full summary: e2e/report/summary.md (${failed.length} failures, ${advice.size} pieces of advice)`);
