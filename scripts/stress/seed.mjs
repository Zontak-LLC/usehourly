// Writes the SQL that fills a database with many test accounts for the stress test (issue 180), and the SQL that
// removes them again. It only WRITES FILES: it never talks to a database or a site. Apply the files with wrangler.
//
//   npm run stress:seed -- [--accounts=10000] [--today=2026-10-24] [--seed=20261023] [--out=.stress] [--max-mb=45]
//
// The password every stress account signs in with is kept in .stress/password (git-ignored; made on the first run,
// or taken from STRESS_PASSWORD). It is never printed.
//
// Then, for the STAGING copy only (never production):
//   for f in .stress/seed-*.sql; do npx wrangler d1 execute DB --remote --config wrangler.staging.jsonc --file="$f" -y; done
// The cheap clean-up is a fresh staging database (`npm run stress:cleanup-staging`); the cleanup-*.sql files remove the
// rows one range at a time instead (every delete is a billed row write, so that costs about as much as the seed).
//
// THE MIX (fixed per block of 100 accounts, so 10,000 accounts are exactly 6,000 / 3,000 / 900 / 100):
//   60% tried it  1 client, 1 project, 0 to 10 entries over a few days, some time in the last half year
//   30% light     2 or 3 clients, 100 to 300 entries over 2 to 5 months, no invoices
//    9% regular   3 to 6 clients, about 1,500 entries over 1 to 2 years, a monthly invoice per client, most paid
//    1% heavy     8 to 15 clients, 20 to 40 projects, about 6,000 entries over 5 years, about 300 invoices
// Weekdays carry the work (a weekend day now and then), lengths run from 15 minutes to 8 hours, notes read like real
// ones. Invoices are built by the app's own code (buildInvoice, buildSearchText, summarizeInvoice) into the same
// snapshot invoice.create stores, and the time they bill carries their invoice_id, so the same hours are never on two.
// The data is the same on every run with the same --seed and --today (a seeded random generator).
//
// Every account is stress-NNNNN with the address stress-NNNNN@stress.invalid (a reserved domain: nothing can be mailed
// there), and every row id starts with "stress-" (stress-u/c/p/i/e-NNNNN-...), so a clean-up finds these rows only.
// Each entry insert also writes one entry_changes row (the sync trigger, migration 0032).

import bcrypt from "bcryptjs";

import { buildInvoice, buildSearchText } from "../../src/lib/invoice.ts";
import { summarizeInvoice } from "../../src/lib/invoice-summary.ts";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** D1 refuses a statement over 100 KB: rows are packed into INSERTs up to this many characters. */
export const MAX_STATEMENT_CHARS = 90_000;
/** Accounts removed per clean-up step, so one DELETE never runs into D1's per-query time limit. */
export const CLEANUP_STEP = 50;
/** invoice.create refuses a snapshot over this; the seed must never store one either. */
export const MAX_SNAPSHOT_CHARS = 900_000;
const MAX_SEARCH_CHARS = 50_000;

export const PROFILES = ["tried", "light", "regular", "heavy"];

const CLIENT_NAMES = [
  "Northwind Traders",
  "Bluebird Studio",
  "Pine & Co",
  "Harbor Health",
  "Lumen Labs",
  "Atlas Freight",
  "Juniper Bakery",
  "Kestrel Legal",
  "Mosaic Media",
  "Orchard Dental",
  "Quarry Coffee",
  "Riverbend School",
  "Sable Architects",
  "Tidewater Realty",
  "Union Bikes",
  "Vantage Capital",
  "Willow Yoga",
  "Yardley Books",
  "Zephyr Travel",
  "Copper Kettle",
  "Granite Gym",
  "Hollow Oak Farm",
  "Ivy Interiors",
  "Maple Street Clinic",
  "Nimbus Software",
  "Oakridge Council",
  "Prairie Wind Energy",
  "Redwood Outfitters",
  "Summit Accounting",
  "Brightside Charity",
];
const PROJECT_NAMES = [
  "Website",
  "Support",
  "App",
  "Design",
  "Consulting",
  "Retainer",
  "SEO",
  "Newsletter",
  "Brand refresh",
  "Mobile app",
  "Data migration",
  "Training",
  "Maintenance",
  "Photography",
  "Copywriting",
  "Analytics",
  "Onboarding",
  "Shop",
  "Booking system",
  "API",
  "Social media",
  "Annual report",
  "Intranet",
  "Audit",
];
const NOTES = [
  "Planning call",
  "Bug fixes",
  "Layout pass on the home page",
  "Review with the client",
  "Deploy and checks",
  "Weekly sync",
  "Wrote the proposal",
  "Fixed the contact form",
  "Content updates",
  "Email templates",
  "Kick-off meeting",
  "Wireframes for the checkout",
  "Performance tuning",
  "Database backup and restore test",
  "Answered support tickets",
  "Logo sketches",
  "Photo editing",
  "Copy edits on the about page",
  "Sprint planning",
  "Code review",
  "Set up analytics",
  "Accessibility fixes",
  "Client's feedback round 2",
  "Invoice questions",
  "Migrated the old blog posts",
  "Training session with the team",
  "Wrote the user guide",
  "Research",
  "Moved DNS to the new host",
  "Updated plugins",
  "Mobile layout fixes",
  "Meeting notes and follow-up",
];
const COLORS = ["#2563c9", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2", "#ca8a04", "#db2777"];
/** Entry lengths in minutes, with how often each appears: short tasks are common, a full day is rare. */
const MINUTES = [
  [15, 6],
  [30, 10],
  [45, 8],
  [60, 14],
  [90, 12],
  [120, 14],
  [150, 6],
  [180, 10],
  [240, 9],
  [300, 4],
  [360, 4],
  [480, 3],
];

const pad = (n, w) => String(n).padStart(w, "0");
const q = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
const DAY = 86_400_000;

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
const between = (R, lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
const pick = (R, list) => list[Math.floor(R() * list.length)];
function weighted(R, pairs) {
  const total = pairs.reduce((a, [, w]) => a + w, 0);
  let x = R() * total;
  for (const [value, w] of pairs) {
    x -= w;
    if (x < 0) return value;
  }
  return pairs[pairs.length - 1][0];
}
function distinct(R, list, count) {
  const pool = [...list];
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
  return out;
}

const ms = (date) => Date.parse(`${date}T12:00:00Z`);
const addDays = (date, k) => new Date(ms(date) + k * DAY).toISOString().slice(0, 10);
const stampOf = (date, hour, minute = 0) => `${date}T${pad(hour, 2)}:${pad(minute, 2)}:00.000+00:00`;
const isWeekend = (date) => [0, 6].includes(new Date(ms(date)).getUTCDay());
const monthEnd = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
};
const nextMonth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1, 2)}`;
};

/** The weekdays of the `days` days that end on `today` (a YYYY-MM-DD string), oldest first. */
export function weekdaysBefore(today, days) {
  const end = Date.parse(`${today}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(end)) throw new Error(`Not a date: ${today}`);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end - i * DAY);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Which kind of account number `n` is. Fixed per block of 100 numbers: exactly 60 / 30 / 9 / 1 in every block. */
export function profileOf(n, seed) {
  const slot = (((n * 37 + seed) % 100) + 100) % 100;
  if (slot < 60) return "tried";
  if (slot < 90) return "light";
  if (slot < 99) return "regular";
  return "heavy";
}

/** How each kind of account is shaped. */
const SHAPES = {
  tried: { clients: [1, 1], projects: [1, 1], entries: [0, 10], span: [1, 10], endAgo: [0, 180] },
  light: { clients: [2, 3], projects: [2, 5], entries: [100, 300], span: [60, 150], endAgo: [0, 90] },
  regular: { clients: [3, 6], projects: [4, 10], entries: [1300, 1700], span: [365, 730], endAgo: [0, 0] },
  heavy: { clients: [8, 15], projects: [20, 40], entries: [5500, 6500], span: [1826, 1826], endAgo: [0, 0] },
};

/** The clients and projects of one account: each client is busy for a stretch of the account's life. */
function buildBook(R, n, profile, first, last) {
  const shape = SHAPES[profile];
  const clientCount = between(R, ...shape.clients);
  const projectCount = Math.max(clientCount, between(R, ...shape.projects));
  const spanDays = Math.round((ms(last) - ms(first)) / DAY);
  const anchors = profile === "heavy" ? 2 : 1;
  const clients = distinct(R, CLIENT_NAMES, clientCount).map((name, k) => {
    // The first one or two clients last the whole time; the others come and go (15% to 50% of the span).
    const length = k < anchors ? spanDays : Math.round(spanDays * (0.15 + R() * 0.35));
    const start = k < anchors ? 0 : between(R, 0, spanDays - length);
    return {
      id: `stress-c-${pad(n, 5)}-${k}`,
      name,
      color: COLORS[k % COLORS.length],
      from: addDays(first, start),
      to: addDays(first, start + length),
      email: profile === "regular" || profile === "heavy" ? `billing-${k}@client${pad(n, 5)}.invalid` : null,
    };
  });
  const projects = [];
  for (let k = 0; k < projectCount; k++) {
    const client = clients[k < clientCount ? k : Math.floor(R() * clientCount)];
    const taken = new Set(projects.filter((p) => p.clientId === client.id).map((p) => p.name));
    const name =
      profile === "tried"
        ? "General"
        : distinct(
            R,
            PROJECT_NAMES.filter((x) => !taken.has(x)),
            1,
          )[0];
    // One internal project in the bigger books: time that is never billed.
    const billable = !(k === projectCount - 1 && (profile === "regular" || profile === "heavy"));
    const rate = !billable || (profile === "tried" && R() < 0.6) ? 0 : between(R, 10, 40) * 500;
    projects.push({ id: `stress-p-${pad(n, 5)}-${k}`, clientId: client.id, name, rate, billable, client });
  }
  return { clients, projects };
}

/** The time of one account, oldest first: weekdays mostly, on a project of a client busy on that day. */
function buildEntries(R, n, profile, first, last, projects, nonBillable) {
  const count = between(R, ...SHAPES[profile].entries);
  const spanDays = Math.round((ms(last) - ms(first)) / DAY);
  const rows = [];
  while (rows.length < count) {
    const date = addDays(first, between(R, 0, spanDays));
    if (isWeekend(date) && R() > 0.05) continue;
    const busy = projects.filter((p) => p.client.from <= date && date <= p.client.to);
    const project = pick(R, busy.length ? busy : projects);
    const note = R() < 0.12 ? "" : pick(R, NOTES) + (R() < 0.15 ? ` (#${between(R, 100, 999)})` : "");
    rows.push({
      date,
      minutes: weighted(R, MINUTES),
      note,
      project,
      hour: between(R, 9, 20),
      nb: nonBillable.has(date),
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows.map((r, k) => ({ ...r, id: `stress-e-${pad(n, 5)}-${pad(k, 4)}`, invoiceId: null }));
}

/** One invoice as invoice.create stores it: the frozen snapshot from the app's own totals, and whether it is paid. */
function makeInvoice(R, { id, number, user, client, totals, issueDate, from, to, today }) {
  const dueDate = addDays(issueDate, 30);
  const notes = R() < 0.5 ? "Thank you for your business." : "";
  const snapshot = {
    currency: "USD",
    seller: {
      name: user.business_name,
      ein: null,
      address: user.address,
      email: user.email,
      logo: null,
      logoHash: null,
      paymentInstructions: user.payment_instructions,
    },
    client: { name: client.name, legalName: null, address: null, logo: null, logoHash: null },
    number,
    issueDate,
    dueDate,
    periodFrom: from,
    periodTo: to,
    notes,
    includeDetail: true,
    compactNotes: false,
    lines: totals.lines,
    detail: totals.detail,
    totalMinutes: totals.totalMinutes,
    totalCents: totals.totalCents,
  };
  const snapshotText = JSON.stringify(snapshot);
  if (snapshotText.length > MAX_SNAPSHOT_CHARS) throw new Error(`Invoice ${id} is too big to store.`);
  // Older invoices are mostly paid (a few stay late); recent ones are paid now and then.
  const old = ms(today) - ms(issueDate) > 45 * DAY;
  const paidOn = addDays(issueDate, between(R, 3, 35));
  const paid = paidOn <= today && R() < (old ? 0.92 : 0.3);
  return {
    id,
    clientId: client.id,
    clientName: client.name,
    snapshot,
    snapshotText,
    paidDate: paid ? paidOn : null,
    remind: !paid && R() < 0.3,
    // The reminders an overdue invoice has had by now (a day after the due date, then a week after), as the cron
    // would have sent them: the cron's own query then finds only the few that are really due.
    remindersSent: dueDate < addDays(today, -7) ? 2 : dueDate < addDays(today, -1) ? 1 : 0,
    createdAt: stampOf(issueDate, 10),
  };
}

/** A monthly invoice per client with billable time, made the way invoice.create makes one, for the bigger books. */
function buildInvoices(R, n, user, clients, entries, today) {
  const invoices = [];
  const perYear = new Map();
  const thisMonth = today.slice(0, 7);
  let month = entries[0]?.date.slice(0, 7);
  while (month && month < thisMonth) {
    const from = `${month}-01`;
    const to = monthEnd(month);
    const issueDate = `${nextMonth(month)}-01`;
    // Last month is not always billed yet: that is what the bill bar and the "invoice is due" prompt are for.
    const lastMonth = nextMonth(month) === thisMonth;
    for (const client of clients) {
      if (lastMonth && R() < 0.5) continue;
      const billed = entries.filter(
        (e) => e.project.clientId === client.id && e.date >= from && e.date <= to && !e.nb && e.minutes > 0,
      );
      const totals = buildInvoice(
        billed.map((e) => ({
          date: e.date,
          minutes: e.minutes,
          note: e.note,
          started_at: null,
          project_id: e.project.id,
          project: { name: e.project.name, hourly_rate: e.project.rate, billable: e.project.billable },
        })),
      );
      if (totals.lines.length === 0 || totals.totalCents === 0) continue;
      const year = issueDate.slice(0, 4);
      const seq = (perYear.get(year) ?? 0) + 1;
      perYear.set(year, seq);
      const id = `stress-i-${pad(n, 5)}-${pad(invoices.length, 4)}`;
      invoices.push(
        makeInvoice(R, { id, number: `INV-${year}-${pad(seq, 3)}`, user, client, totals, issueDate, from, to, today }),
      );
      for (const e of billed) if (e.project.billable) e.invoiceId = id;
    }
    month = nextMonth(month);
  }
  return invoices;
}

/** The rows of one account, as SQL value lists per table (parents first), and its kind. */
export function accountRows(n, { today, passwordHash, seed }) {
  const R = rng(seed * 100_003 + n);
  const profile = profileOf(n, seed);
  const shape = SHAPES[profile];
  const id = userId(n);
  const last = addDays(today, -between(R, ...shape.endAgo));
  const first = addDays(last, -between(R, ...shape.span));
  const big = profile === "regular" || profile === "heavy";
  const verified = big || R() < (profile === "light" ? 0.7 : 0.3);
  const user = {
    email: emailFor(n),
    business_name: big ? `Stress Studio ${pad(n, 5)}` : null,
    address: big ? `${between(R, 1, 999)} Main Street\nSpringfield` : null,
    payment_instructions: big ? "Bank transfer to the account on file." : null,
  };
  const signedUp = stampOf(addDays(first, -between(R, 0, 3)), between(R, 8, 22), between(R, 0, 59));
  const users = [
    `(${[
      q(id),
      q(`stress-${pad(n, 5)}`),
      q(user.email),
      q(passwordHash),
      q(signedUp),
      verified ? q(signedUp) : "NULL",
      q(user.business_name),
      q(user.address),
      q(user.payment_instructions),
      verified && profile !== "tried" && R() < 0.15 ? 1 : 0, // the app allows it with a confirmed address only
      q("America/New_York"),
    ].join(",")})`,
  ];

  const { clients, projects } = buildBook(R, n, profile, first, last);
  // A few holidays a year in the bigger books: days whose time is never billed.
  const nonBillable = new Set();
  if (big) for (let d = first; d <= last; d = addDays(d, between(R, 60, 150))) if (!isWeekend(d)) nonBillable.add(d);
  const entries = buildEntries(R, n, profile, first, last, projects, nonBillable);
  const invoices = big ? buildInvoices(R, n, user, clients, entries, today) : [];

  return {
    profile,
    users,
    clients: clients.map(
      (c) => `(${[q(c.id), q(id), q(c.name), q(c.color), q(c.email), q(stampOf(c.from, 9))].join(",")})`,
    ),
    projects: projects.map(
      (p) =>
        `(${[q(p.id), q(id), q(p.clientId), q(p.name), p.rate, p.billable ? 1 : 0, q(stampOf(p.client.from, 9))].join(",")})`,
    ),
    invoices: invoices.map(
      (i) =>
        `(${[
          q(i.id),
          q(id),
          q(i.clientId),
          q(i.clientName),
          q(i.snapshot.number),
          q(i.snapshot.issueDate),
          q(i.snapshot.dueDate),
          q(i.paidDate),
          q(i.snapshot.periodFrom),
          q(i.snapshot.periodTo),
          i.snapshot.totalMinutes,
          i.snapshot.totalCents,
          q("USD"),
          q(i.snapshot.notes),
          q(i.snapshotText),
          q(buildSearchText(i.snapshot).slice(0, MAX_SEARCH_CHARS)),
          q(summarizeInvoice(i.snapshot)),
          i.remind ? 1 : 0,
          i.remind ? i.remindersSent : 0,
          q(i.createdAt),
        ].join(",")})`,
    ),
    nonBillable: [...nonBillable].map((d) => `(${q(id)},${q(d)},${q(stampOf(d, 8))})`),
    timeEntries: entries.map((e) => {
      const stamp = q(stampOf(e.date, e.hour));
      return `(${[q(e.id), q(id), q(e.project.id), q(e.date), e.minutes, q(e.note), stamp, stamp, q(e.invoiceId)].join(",")})`;
    }),
  };
}

const TABLES = ["users", "clients", "projects", "invoices", "nonBillable", "timeEntries"];
const HEADS = {
  users:
    "INSERT OR IGNORE INTO auth_users (id,name,email,password_hash,created_at,email_verified_at,business_name,address,payment_instructions,weekly_reminder,timezone) VALUES",
  clients: "INSERT OR IGNORE INTO clients (id,user_id,name,color,email,created_at) VALUES",
  projects: "INSERT OR IGNORE INTO projects (id,user_id,client_id,name,hourly_rate,billable,created_at) VALUES",
  invoices:
    "INSERT OR IGNORE INTO invoices (id,user_id,client_id,client_name,number,issue_date,due_date,paid_date,period_from,period_to,total_minutes,total_cents,currency,notes,snapshot,search_text,summary,remind_overdue,reminders_sent,created_at) VALUES",
  nonBillable: "INSERT OR IGNORE INTO non_billable_days (user_id,date,created_at) VALUES",
  timeEntries:
    "INSERT OR IGNORE INTO time_entries (id,user_id,project_id,date,minutes,note,created_at,updated_at,invoice_id) VALUES",
};

/** Packs rows into INSERT statements of at most MAX_STATEMENT_CHARS characters each. */
function inserts(head, rows) {
  const out = [];
  let batch = [];
  let size = head.length + 2;
  for (const row of rows) {
    if (row.length + head.length + 3 > MAX_STATEMENT_CHARS)
      throw new Error("A single row is over D1's statement limit.");
    if (batch.length && size + row.length + 2 > MAX_STATEMENT_CHARS) {
      out.push(`${head}\n${batch.join(",\n")};`);
      batch = [];
      size = head.length + 2;
    }
    batch.push(row);
    size += row.length + 2;
  }
  if (batch.length) out.push(`${head}\n${batch.join(",\n")};`);
  return out;
}

const emptyCounts = () => ({
  accounts: 0,
  tried: 0,
  light: 0,
  regular: 0,
  heavy: 0,
  clients: 0,
  projects: 0,
  invoices: 0,
  nonBillableDays: 0,
  entries: 0,
  billedEntries: 0,
});

/** Adds one account's rows to a running total (entry_changes = entries: the trigger writes one per insert). */
function addCounts(counts, rows) {
  counts.accounts += 1;
  counts[rows.profile] += 1;
  counts.clients += rows.clients.length;
  counts.projects += rows.projects.length;
  counts.invoices += rows.invoices.length;
  counts.nonBillableDays += rows.nonBillable.length;
  counts.entries += rows.timeEntries.length;
  counts.billedEntries += rows.timeEntries.filter((r) => !r.endsWith(",NULL)")).length;
}

/** The SQL for a group of accounts' rows, parents before children. */
function sqlFor(group) {
  return TABLES.flatMap((t) =>
    inserts(
      HEADS[t],
      group.flatMap((r) => r[t]),
    ),
  ).join("\n");
}

/** The SQL that adds accounts `from` to `to` (both included). */
export function seedSql(from, to, opts) {
  const group = [];
  for (let n = from; n <= to; n++) group.push(accountRows(n, opts));
  return sqlFor(group);
}

/**
 * The seed files for accounts 1..accounts, each at most `maxBytes` (whole accounts per file, in order), with the
 * running row counts. A generator, so 10,000 accounts never sit in memory at once.
 */
export function* seedFiles({ accounts, maxBytes = 45_000_000, counts = emptyCounts(), ...opts }) {
  let group = [];
  let size = 0;
  let index = 1;
  const flush = () => ({ name: `seed-${pad(index++, 4)}.sql`, sql: sqlFor(group), accounts: group.length });
  for (let n = 1; n <= accounts; n++) {
    const rows = accountRows(n, opts);
    addCounts(counts, rows);
    const bytes = TABLES.reduce((a, t) => a + rows[t].reduce((b, r) => b + r.length + 2, 0), 0);
    if (group.length && size + bytes > maxBytes) {
      yield flush();
      group = [];
      size = 0;
    }
    group.push(rows);
    size += bytes;
  }
  if (group.length) yield flush();
}

/** The row counts the seed for 1..accounts makes, without keeping the SQL. */
export function expectedCounts({ accounts, ...opts }) {
  const counts = emptyCounts();
  for (let n = 1; n <= accounts; n++) addCounts(counts, accountRows(n, opts));
  return counts;
}

/** The SQL that removes accounts `from` to `to` and everything they own, children first, by id range. */
export function cleanupSql(from, to) {
  const lo = pad(from, 5);
  const hi = pad(to + 1, 5);
  const users = `user_id >= 'stress-u-${lo}' AND user_id < 'stress-u-${hi}'`;
  return [
    `DELETE FROM time_entries WHERE id >= 'stress-e-${lo}' AND id < 'stress-e-${hi}';`,
    `DELETE FROM time_entries WHERE ${users};`,
    `DELETE FROM entry_changes WHERE ${users};`,
    `DELETE FROM invoices WHERE ${users};`,
    `DELETE FROM auth_users WHERE id >= 'stress-u-${lo}' AND id < 'stress-u-${hi}';`,
  ].join("\n");
}

/** The last step: anything the traffic run made that the ranges did not reach (an account it registered itself). */
export const FINAL_CLEANUP_SQL = [
  "DELETE FROM time_entries WHERE user_id IN (SELECT id FROM auth_users WHERE email LIKE 'stress-%@stress.invalid');",
  "DELETE FROM entry_changes WHERE user_id LIKE 'stress-u-%' OR user_id IN (SELECT id FROM auth_users WHERE email LIKE 'stress-%@stress.invalid');",
  "DELETE FROM auth_users WHERE email LIKE 'stress-%@stress.invalid';",
].join("\n");

/** The clean-up files for accounts 1..accounts, in the order they must run. */
export function cleanupFiles(accounts) {
  const files = [];
  const width = String(Math.ceil(accounts / CLEANUP_STEP) + 1).length;
  let i = 1;
  for (let from = 1; from <= accounts; from += CLEANUP_STEP, i++) {
    files.push({
      name: `cleanup-${pad(i, width)}.sql`,
      sql: cleanupSql(from, Math.min(accounts, from + CLEANUP_STEP - 1)),
    });
  }
  files.push({ name: `cleanup-${pad(i, width)}.sql`, sql: FINAL_CLEANUP_SQL });
  return files;
}

/** The password of the stress accounts: STRESS_PASSWORD, else the one kept in <out>/password, else a new one. */
function stressPassword(out) {
  const file = path.join(out, "password");
  if (process.env.STRESS_PASSWORD) return process.env.STRESS_PASSWORD;
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const made = randomBytes(18).toString("base64url");
  writeFileSync(file, `${made}\n`, { mode: 0o600 });
  return made;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
  const accounts = Number(arg("accounts", 10000));
  const seed = Number(arg("seed", 20261023));
  const maxBytes = Number(arg("max-mb", 45)) * 1_000_000;
  const today = arg("today", new Date().toISOString().slice(0, 10));
  const out = arg("out", ".stress");
  if (!(accounts >= 1 && accounts <= 99_998 && Number.isInteger(seed) && maxBytes >= 1_000_000)) {
    console.error("--accounts must be 1 to 99,998, --seed a whole number and --max-mb at least 1.");
    process.exit(2);
  }
  mkdirSync(out, { recursive: true });
  const password = stressPassword(out);
  if (password.length < 12) {
    console.error("The stress password must be 12 characters or more.");
    process.exit(2);
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const counts = emptyCounts();
  let files = 0;
  let bytes = 0;
  for (const f of seedFiles({ accounts, maxBytes, counts, today, passwordHash, seed })) {
    writeFileSync(path.join(out, f.name), f.sql);
    files += 1;
    bytes += f.sql.length;
  }
  const cleanup = cleanupFiles(accounts);
  for (const f of cleanup) writeFileSync(path.join(out, f.name), f.sql);
  const heavy = [];
  for (let n = 1; n <= accounts && heavy.length < 5; n++) if (profileOf(n, seed) === "heavy") heavy.push(emailFor(n));
  const manifest = {
    accounts,
    seed,
    today,
    counts,
    entryChanges: counts.entries,
    seedFiles: files,
    sqlBytes: bytes,
    heavy,
  };
  writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Wrote ${files} seed files (${(bytes / 1e6).toFixed(0)} MB) and ${cleanup.length} clean-up files to ${out}/.`,
  );
  console.log("Rows:", JSON.stringify({ ...counts, entryChanges: counts.entries }));
  console.log(`Heavy accounts: ${heavy.join(", ")}. The password is in ${out}/password. Nothing was applied.`);
}
