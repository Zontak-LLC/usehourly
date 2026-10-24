// Writes the SQL that fills a database with many test accounts for the stress test (issue 180), and the SQL that
// removes them again. It only WRITES FILES: it never talks to a database or a site. Apply the files with wrangler.
//
//   STRESS_PASSWORD='<a password>' node scripts/stress/seed.mjs [--accounts=10000] [--entries=200] [--today=2026-10-23]
//                                                              [--out=.stress] [--per-file=250]
//
// Then, for the STAGING copy only (never production):
//   for f in .stress/seed-*.sql; do npx wrangler d1 execute DB --remote --config wrangler.staging.jsonc --file="$f"; done
//   ...run the test...
//   for f in .stress/cleanup-*.sql; do npx wrangler d1 execute DB --remote --config wrangler.staging.jsonc --file="$f"; done
//
// Every account is named stress-NNNNN with the address stress-NNNNN@stress.invalid (a reserved domain: nothing can
// be mailed there), and every row id starts with "stress-", so the clean-up finds exactly these rows and nothing else.
// Each account gets 3 clients, 5 projects and `--entries` time entries spread over the weekdays of the last 300 days.
// The data is the same on every run (a seeded random generator). Invoices are not seeded: their frozen snapshot is
// built by the app, so the traffic scenarios make them through the real router.
//
// Size: 10,000 accounts x 200 entries = 2,000,000 entries. Each entry insert also writes one entry_changes row (the
// sync trigger, migration 0032), so the clean-up removes those too.

import bcrypt from "bcryptjs";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Rows per INSERT statement: D1 refuses a statement over 100 KB, and an entry row is about 150 characters. */
export const ROWS_PER_INSERT = 300;
/** Accounts removed per clean-up step, so one DELETE never runs into D1's per-query time limit. */
export const CLEANUP_STEP = 50;

const CLIENTS = ["Northwind", "Bluebird Studio", "Pine & Co"];
const PROJECTS = [
  ["Website", 0, 9500],
  ["Support", 0, 7500],
  ["App", 1, 12000],
  ["Design", 1, 8500],
  ["Consulting", 2, 15000],
];
const NOTES = ["Planning call", "Bug fixes", "Layout pass", "Review with the client", "Deploy and checks", ""];
const MINUTES = [15, 30, 45, 60, 90, 120, 180, 240];

const pad = (n, w) => String(n).padStart(w, "0");
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export const userId = (n) => `stress-u-${pad(n, 5)}`;
export const emailFor = (n) => `stress-${pad(n, 5)}@stress.invalid`;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The weekdays of the `days` days that end on `today` (a YYYY-MM-DD string), oldest first. */
export function weekdaysBefore(today, days) {
  const end = Date.parse(`${today}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(end)) throw new Error(`Not a date: ${today}`);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end - i * 86_400_000);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** The rows of one account, as arrays of SQL value lists per table. */
export function accountRows(n, { entries, today, passwordHash }) {
  const R = rng(20261023 + n);
  const id = userId(n);
  const stamp = `${today} 09:00:00`;
  const users = [`(${q(id)},${q(`stress-${pad(n, 5)}`)},${q(emailFor(n))},${q(passwordHash)},${q(stamp)},${q(stamp)})`];
  const clients = CLIENTS.map(
    (name, k) => `(${q(`stress-c-${pad(n, 5)}-${k}`)},${q(id)},${q(name)},${q("#6366f1")},${q(stamp)})`,
  );
  const projectIds = PROJECTS.map((_, k) => `stress-p-${pad(n, 5)}-${k}`);
  const projects = PROJECTS.map(
    ([name, client, rate], k) =>
      `(${q(projectIds[k])},${q(id)},${q(`stress-c-${pad(n, 5)}-${client}`)},${q(name)},${rate},${q(stamp)})`,
  );
  const days = weekdaysBefore(today, 300);
  const timeEntries = [];
  for (let k = 0; k < entries; k++) {
    // Spread evenly over the days, so every recent week has time in it, then shuffle the project and length.
    const date = days[Math.floor((k * days.length) / Math.max(entries, 1))];
    const project = projectIds[Math.floor(R() * projectIds.length)];
    const minutes = MINUTES[Math.floor(R() * MINUTES.length)];
    const note = NOTES[Math.floor(R() * NOTES.length)];
    timeEntries.push(
      `(${q(`stress-e-${pad(n, 5)}-${pad(k, 4)}`)},${q(id)},${q(project)},${q(date)},${minutes},${q(note)},${q(stamp)},${q(stamp)})`,
    );
  }
  return { users, clients, projects, timeEntries };
}

const HEADS = {
  users: "INSERT INTO auth_users (id,name,email,password_hash,created_at,email_verified_at) VALUES",
  clients: "INSERT INTO clients (id,user_id,name,color,created_at) VALUES",
  projects: "INSERT INTO projects (id,user_id,client_id,name,hourly_rate,created_at) VALUES",
  timeEntries: "INSERT INTO time_entries (id,user_id,project_id,date,minutes,note,created_at,updated_at) VALUES",
};

function inserts(head, rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    out.push(`${head}\n${rows.slice(i, i + ROWS_PER_INSERT).join(",\n")};`);
  }
  return out;
}

/** The SQL that adds accounts `from` to `to` (both included), parents before children. */
export function seedSql(from, to, opts) {
  const all = { users: [], clients: [], projects: [], timeEntries: [] };
  for (let n = from; n <= to; n++) {
    const rows = accountRows(n, opts);
    for (const key of Object.keys(all)) all[key].push(...rows[key]);
  }
  return Object.keys(all)
    .flatMap((key) => inserts(HEADS[key], all[key]))
    .join("\n");
}

/** The SQL that removes accounts `from` to `to` and everything they own, children first, by id range. */
export function cleanupSql(from, to) {
  const lo = pad(from, 5);
  const hi = pad(to + 1, 5);
  return [
    `DELETE FROM time_entries WHERE id >= 'stress-e-${lo}' AND id < 'stress-e-${hi}';`,
    `DELETE FROM time_entries WHERE user_id >= 'stress-u-${lo}' AND user_id < 'stress-u-${hi}';`,
    `DELETE FROM entry_changes WHERE user_id >= 'stress-u-${lo}' AND user_id < 'stress-u-${hi}';`,
    `DELETE FROM auth_users WHERE id >= 'stress-u-${lo}' AND id < 'stress-u-${hi}';`,
  ].join("\n");
}

/** The last step: anything the traffic run made that the ranges did not reach (an account it registered itself). */
export const FINAL_CLEANUP_SQL = [
  "DELETE FROM time_entries WHERE user_id IN (SELECT id FROM auth_users WHERE email LIKE 'stress-%@stress.invalid');",
  "DELETE FROM entry_changes WHERE user_id LIKE 'stress-u-%' OR user_id IN (SELECT id FROM auth_users WHERE email LIKE 'stress-%@stress.invalid');",
  "DELETE FROM auth_users WHERE email LIKE 'stress-%@stress.invalid';",
].join("\n");

/** Splits 1..accounts into files of `perFile` accounts: [{ name, sql }]. */
export function planFiles({ accounts, perFile, ...opts }) {
  const files = [];
  const width = String(Math.ceil(accounts / perFile)).length;
  for (let from = 1, i = 1; from <= accounts; from += perFile, i++) {
    const to = Math.min(accounts, from + perFile - 1);
    files.push({ name: `seed-${pad(i, width)}.sql`, sql: seedSql(from, to, opts) });
  }
  let i = 1;
  const cw = String(Math.ceil(accounts / CLEANUP_STEP) + 1).length;
  for (let from = 1; from <= accounts; from += CLEANUP_STEP, i++) {
    files.push({
      name: `cleanup-${pad(i, cw)}.sql`,
      sql: cleanupSql(from, Math.min(accounts, from + CLEANUP_STEP - 1)),
    });
  }
  files.push({ name: `cleanup-${pad(i, cw)}.sql`, sql: FINAL_CLEANUP_SQL });
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
  const password = process.env.STRESS_PASSWORD ?? "";
  if (password.length < 12) {
    console.error("Set STRESS_PASSWORD (12 characters or more): every stress account signs in with it.");
    process.exit(2);
  }
  const accounts = Number(arg("accounts", 10000));
  const entries = Number(arg("entries", 200));
  const perFile = Number(arg("per-file", 250));
  const today = arg("today", new Date().toISOString().slice(0, 10));
  const out = arg("out", ".stress");
  if (!(accounts >= 1 && accounts <= 99_999 && entries >= 0 && entries <= 9_999 && perFile >= 1)) {
    console.error("--accounts must be 1 to 99,999, --entries 0 to 9,999 and --per-file at least 1.");
    process.exit(2);
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  mkdirSync(out, { recursive: true });
  const files = planFiles({ accounts, perFile, entries, today, passwordHash });
  for (const f of files) writeFileSync(path.join(out, f.name), f.sql);
  console.log(
    `Wrote ${files.length} files to ${out}/ for ${accounts} accounts and ${accounts * entries} entries. Nothing was applied.`,
  );
}
