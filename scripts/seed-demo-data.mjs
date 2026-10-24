// Fills the LOCAL app with test data so every page can be seen with a lot in it:
//   node scripts/seed-demo-data.mjs            (app running: npm run dev, on http://127.0.0.1:3028)
//   node scripts/seed-demo-data.mjs --reset    (removes every account this script made)
//   node scripts/seed-demo-data.mjs --light 0  (skip the 10,000 light accounts)
//
// Sign in at http://localhost:3028/auth/v2/login with:
//   example1@example.com   a busy freelancer: 10 clients, 21 projects, four months of time, invoices, budgets, a team
//   example2@example.com   a lighter freelancer: 4 clients, 9 projects, ten weeks, a few invoices
//   example3@example.com   a team member of example1 (logs time on example1's clients)
// All three use the password below. It is a local test value; this script only ever talks to the local database.
// The light accounts (light00001@example.com ... light10000@example.com) give the Insights page something to show.
//
//   node scripts/seed-demo-data.mjs --heavy    ONLY heavy@example.com (same password): 15 clients (4 archived), 40
//                                              projects (some archived), three years of weekday time up to today (about
//                                              4,000 entries), about 100 invoices through the real invoice.create,
//                                              non-billable days and budgets. For measuring pages with a long history.
// SEED_BASE=http://127.0.0.1:3032 and SEED_PERSIST=.wrangler/state-perf point it at another local app and its own
// database folder (a worktree's dev server started with E2E_PERSIST). Only localhost / 127.0.0.1 is accepted.

import { chromium } from "@playwright/test";
import bcrypt from "bcryptjs";

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const PASSWORD = "Example-Pass-2026!";
const BASE = process.env.SEED_BASE ?? "http://127.0.0.1:3028";
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error(`Refusing ${BASE}: local app only.`);
const PERSIST = process.env.SEED_PERSIST ? ["--persist-to", process.env.SEED_PERSIST] : [];
const TODAY = "2026-10-22";
const argv = process.argv.slice(2);
const flag = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const LIGHT = Number(flag("--light", "10000"));

const sh = (sql) => {
  writeFileSync("/tmp/seed.sql", sql);
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--file=/tmp/seed.sql", ...PERSIST], {
    stdio: "pipe",
    maxBuffer: 1 << 28,
  });
};
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------- reset ----------
const RESET_SQL = `
DELETE FROM auth_users WHERE email LIKE 'example_@example.com' OR email LIKE 'light_____@example.com';`;
if (argv.includes("--reset")) {
  sh(RESET_SQL);
  console.log("Removed the example and light accounts.");
  process.exit(0);
}

// ---------- a tiny seeded random generator, so every run makes the same data ----------
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
const R = rng(20261022);
const pick = (arr) => arr[Math.floor(R() * arr.length)];
const between = (a, b) => a + Math.floor(R() * (b - a + 1));

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s) => new Date(`${s}T12:00:00`);
const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const isWeekday = (s) => ![0, 6].includes(parse(s).getDay());

// ---------- the people and their work ----------
const NOTES = {
  design: [
    "Wireframes for the new flow",
    "Homepage hero and navigation",
    "Icon set, first round",
    "Review notes from the client call",
    "Pricing page layout, first pass",
    "Colour and type tests",
    "Handoff files for developers",
    "Mobile layout pass",
    "Illustration for the empty states",
  ],
  dev: [
    "Sign-in screen and password reset",
    "API client and error handling",
    "Fix the cart total rounding bug",
    "Unit tests for the invoice maths",
    "Search box with keyboard support",
    "Dashboard charts, first version",
    "Code review and cleanup",
    "Deploy and smoke test",
    "Performance pass on the list view",
  ],
  pm: [
    "Weekly sync and notes",
    "Planning next sprint",
    "Scope call and estimate",
    "Status report for the client",
    "Backlog cleanup",
    "Kick-off workshop",
    "Retro and follow-ups",
  ],
  content: [
    "Draft of the launch email",
    "Edit the case study",
    "Social posts for the week",
    "Product descriptions, batch 2",
    "Newsletter layout",
    "Proofreading the help pages",
  ],
  admin: [
    "Invoicing and bookkeeping",
    "Inbox and scheduling",
    "Planning next week",
    "Tax paperwork",
    "Portfolio update",
    "Reading and learning",
  ],
};
const MAYA = [
  {
    client: "Northwind Studio",
    color: "#2563c9",
    email: "accounts@northwind.example",
    legal: "Northwind Studio LLC",
    addr: "410 Harbor St\nSuite 12\nBoston, MA 02110",
    w: 3,
    projects: [
      ["Website redesign", 9500, "design"],
      ["Brand refresh", 8500, "design"],
    ],
  },
  {
    client: "Fable Labs",
    color: "#10b981",
    email: "billing@fablelabs.example",
    legal: "Fable Labs Inc.",
    addr: "88 Mission Rd\nSan Francisco, CA 94105",
    w: 3,
    projects: [
      ["Mobile app", 12000, "dev"],
      ["Design system", 11000, "design"],
    ],
  },
  {
    client: "Acme Corp",
    color: "#f59e0b",
    email: "ap@acme.example",
    legal: "Acme Corporation",
    addr: "1 Acme Way\nChicago, IL 60601",
    w: 2,
    projects: [
      ["Landing pages", 9000, "dev"],
      ["Email templates", 7500, "content"],
    ],
  },
  {
    client: "Bluebird Cafe",
    color: "#0ea5e9",
    email: "hello@bluebird.example",
    legal: "Bluebird Cafe LLC",
    addr: "23 Main St\nPortland, OR 97201",
    w: 1,
    projects: [["Menu and signage", 7000, "design"]],
  },
  {
    client: "Helios Energy",
    color: "#ef4444",
    email: "finance@helios.example",
    legal: "Helios Energy Partners",
    addr: "900 Solar Blvd\nAustin, TX 78701",
    w: 3,
    projects: [
      ["Dashboard", 13000, "dev"],
      ["Data pipeline", 14000, "dev"],
      ["Support retainer", 10000, "pm"],
    ],
  },
  {
    client: "Kite and Co",
    color: "#0d9488",
    email: "team@kite.example",
    legal: "Kite & Co Ltd",
    addr: "5 Kite Lane\nBrooklyn, NY 11201",
    w: 1,
    projects: [["Social campaign", 8000, "content"]],
  },
  {
    client: "Meridian Health",
    color: "#14b8a6",
    email: "ap@meridianhealth.example",
    legal: "Meridian Health Group",
    addr: "301 Care Ave\nDenver, CO 80202",
    w: 2,
    projects: [
      ["Patient portal", 12500, "dev"],
      ["Accessibility audit", 11500, "pm"],
    ],
  },
  {
    client: "Oakline Legal",
    color: "#d97706",
    email: "office@oakline.example",
    legal: "Oakline Legal PLLC",
    addr: "77 Court St\nSeattle, WA 98101",
    w: 1,
    projects: [["Intake forms", 10500, "dev"]],
  },
  {
    client: "Atelier Lune",
    color: "#db2777",
    email: "compta@atelierlune.example",
    legal: "Atelier Lune SARL",
    addr: "14 Rue des Lilas\n75020 Paris, France",
    w: 1,
    currency: "EUR",
    projects: [["Lune website", 9000, "design"]],
  },
  {
    client: "My own business",
    color: "#64748b",
    email: "",
    legal: "",
    addr: "",
    w: 1,
    projects: [
      ["Admin and invoicing", 0, "admin"],
      ["Learning", 0, "admin"],
    ],
    internal: true,
  },
];
const TOM = [
  {
    client: "Riverbend Dental",
    color: "#0ea5e9",
    email: "office@riverbend.example",
    legal: "Riverbend Dental PC",
    addr: "12 River Rd\nColumbus, OH 43215",
    w: 3,
    projects: [
      ["Booking site", 8000, "dev"],
      ["Patient emails", 6500, "content"],
    ],
  },
  {
    client: "Studio Nine",
    color: "#0d9488",
    email: "hi@studionine.example",
    legal: "Studio Nine Ltd",
    addr: "9 Nine St\nMiami, FL 33101",
    w: 2,
    projects: [
      ["Portfolio site", 7500, "design"],
      ["Logo pack", 7000, "design"],
    ],
  },
  {
    client: "Greenleaf Foods",
    color: "#10b981",
    email: "ap@greenleaf.example",
    legal: "Greenleaf Foods Inc.",
    addr: "400 Orchard Ave\nFresno, CA 93721",
    w: 2,
    projects: [
      ["Shop theme", 9000, "dev"],
      ["Recipe pages", 7000, "content"],
    ],
  },
  {
    client: "Tom's own work",
    color: "#64748b",
    email: "",
    legal: "",
    addr: "",
    w: 1,
    projects: [
      ["Admin", 0, "admin"],
      ["Reading", 0, "admin"],
      ["Side project", 0, "dev"],
    ],
    internal: true,
  },
];

/** One row per entry for a freelancer, over the weekdays from `from` to TODAY. */
/** `to` (default TODAY), `perDay` entries a day and the `lengths` to pick from can be changed (the heavy account). */
const LENGTHS = [30, 45, 60, 90, 120, 150, 180, 240];
function makeEntries(clients, from, { to = TODAY, perDay = [1, 3], lengths = LENGTHS } = {}) {
  const rows = [];
  const weighted = clients.flatMap((c) => Array(c.w).fill(c));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!isWeekday(d) || R() < 0.1) continue;
    const count = between(...perDay);
    let left = between(5, 8) * 60;
    for (let i = 0; i < count && left > 0; i++) {
      const c = pick(weighted);
      const [project, rate, kind] = pick(c.projects);
      const minutes = Math.min(left, pick(lengths));
      left -= minutes;
      rows.push({
        client: c.client,
        project,
        date: d,
        minutes,
        note: pick(NOTES[kind]),
        billable: c.internal ? false : null,
        rateCents: c.internal ? null : rate,
      });
    }
  }
  return rows;
}

// ---------- pictures, drawn in the browser ----------
const browser = await chromium.launch();
const art = (page, text, hue, size, round) =>
  page.evaluate(
    ([text, hue, size, round]) => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, size, size);
      const grad = g.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, `hsl(${hue} 72% 58%)`);
      grad.addColorStop(1, `hsl(${(hue + 40) % 360} 70% 38%)`);
      g.fillStyle = grad;
      g.beginPath();
      if (round) g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      else g.roundRect(0, 0, size, size, size * 0.22);
      g.fill();
      g.fillStyle = "rgba(255,255,255,.18)";
      g.beginPath();
      g.arc(size * 0.85, size * 0.15, size * 0.35, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.font = `800 ${size * (text.length > 1 ? 0.42 : 0.5)}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, size / 2, size / 2 + size * 0.03);
      return c.toDataURL("image/jpeg", 0.85);
    },
    [text, hue, size, round],
  );
const hueOf = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
const initials = (s) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

// ---------- --heavy: one account with three years of history, then stop ----------
if (argv.includes("--heavy")) {
  await seedHeavy();
  await browser.close();
  process.exit(0);
}

// ---------- the 10,000 light accounts, straight into the local database ----------
if (LIGHT > 0) {
  console.log(`Light accounts: ${LIGHT} ...`);
  sh(`DELETE FROM auth_users WHERE email LIKE 'light_____@example.com';`);
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const first = [
    "Ava",
    "Noah",
    "Mia",
    "Liam",
    "Zoe",
    "Omar",
    "Ines",
    "Kai",
    "Lena",
    "Raj",
    "Nora",
    "Theo",
    "Sofia",
    "Jonas",
    "Amara",
    "Luca",
  ];
  const last = [
    "Stone",
    "Reyes",
    "Okafor",
    "Lind",
    "Park",
    "Meyer",
    "Novak",
    "Silva",
    "Haas",
    "Khan",
    "Rossi",
    "Wells",
  ];
  const stamp = (offsetDays, hour = 12) => {
    const d = parse(TODAY);
    d.setDate(d.getDate() - offsetDays);
    d.setHours(hour);
    return d.toISOString().replace("T", " ").slice(0, 19);
  };
  const chunks = [];
  let cur = [];
  const push = (s) => {
    cur.push(s);
    if (cur.length >= 400) {
      chunks.push(cur.join("\n"));
      cur = [];
    }
  };
  for (let i = 1; i <= LIGHT; i++) {
    const id = randomUUID();
    // more sign-ups lately: the age is skewed towards today
    const age = Math.floor(90 * R() ** 1.7);
    const name = `${pick(first)} ${pick(last)}`;
    push(
      `INSERT INTO auth_users (id,name,email,password_hash,created_at,email_verified_at) VALUES (${q(id)},${q(name)},${q(`light${String(i).padStart(5, "0")}@example.com`)},${q(hash)},${q(stamp(age))},${R() < 0.7 ? q(stamp(age)) : "NULL"});`,
    );
    if (R() < 0.38) {
      const cid = randomUUID();
      push(
        `INSERT INTO clients (id,user_id,name,color,created_at) VALUES (${q(cid)},${q(id)},${q(`${pick(["Acme", "Bright", "Orbit", "Pine", "Nova"])} ${pick(["Studio", "Labs", "Co", "Group"])}`)},${q(pick(["#2563c9", "#10b981", "#f59e0b", "#ef4444"]))},${q(stamp(age))});`,
      );
      const pid = randomUUID();
      push(
        `INSERT INTO projects (id,user_id,client_id,name,hourly_rate,created_at) VALUES (${q(pid)},${q(id)},${q(cid)},${q(pick(["Website", "App", "Support", "Design"]))},${between(40, 150) * 100},${q(stamp(age))});`,
      );
      const n = Math.min(between(1, 18), age + 1);
      for (let k = 0; k < n; k++) {
        const dAge = Math.max(0, age - Math.floor(R() * (age + 1)));
        const date = addDays(TODAY, -dAge);
        push(
          `INSERT INTO time_entries (id,user_id,project_id,date,minutes,note,created_at,updated_at) VALUES (${q(randomUUID())},${q(id)},${q(pid)},${q(date)},${pick([30, 60, 90, 120, 180, 240])},${q(pick(NOTES.dev))},${q(stamp(dAge))},${q(stamp(dAge))});`,
        );
      }
    }
  }
  if (cur.length) chunks.push(cur.join("\n"));
  for (let i = 0; i < chunks.length; i++) {
    sh(chunks[i]);
    if (i % 10 === 0) process.stdout.write(`  ${i + 1}/${chunks.length}\r`);
  }
  // page views for the Insights page: the last 30 days
  const views = [];
  for (let d = 0; d < 30; d++) {
    for (const [page, base] of [
      ["today", 120],
      ["week", 60],
      ["month", 55],
      ["invoices", 40],
      ["clients", 30],
      ["account", 20],
      ["report", 12],
      ["new-invoice", 9],
    ]) {
      views.push(
        `INSERT OR REPLACE INTO usage_daily (day,page,count) VALUES (${q(addDays(TODAY, -d))},${q(page)},${Math.round(base * (0.6 + R() * 0.8) * (1.4 - d / 60))});`,
      );
    }
  }
  sh(views.join("\n"));
  console.log(`\nLight accounts done (${chunks.length} chunks).`);
}

// ---------- the three named accounts ----------
sh(`DELETE FROM auth_users WHERE email LIKE 'example_@example.com';`);
const people = [
  {
    n: 1,
    name: "Example One",
    business: "Example One Design Studio",
    ein: "12-3456789",
    address: "200 Example Ave\nSuite 4\nBoston, MA 02110",
    pay: "Pay by ACH to Example One Design Studio\nRouting 011000015 · Account 000123456789\nOr by check, net 30. Thank you!",
    hue: 330,
  },
  {
    n: 2,
    name: "Example Two",
    business: "Example Two Web",
    ein: "98-7654321",
    address: "55 Second St\nAustin, TX 78701",
    pay: "Pay by card or bank transfer within 14 days.",
    hue: 210,
  },
  { n: 3, name: "Example Three", business: "", ein: "", address: "", pay: "", hue: 150 },
];
const hash = bcrypt.hashSync(PASSWORD, 10);
const ids = {};
const probe = await browser.newPage();
await probe.goto("about:blank");
const pics = {};
for (const p of people) {
  ids[p.n] = randomUUID();
  pics[p.n] = {
    avatar: await art(probe, initials(p.name), p.hue, 128, true),
    logo: await art(probe, initials(p.business || p.name), p.hue, 256, false),
  };
  sh(
    `INSERT INTO auth_users (id,name,email,password_hash,email_verified_at) VALUES (${q(ids[p.n])},${q(p.name)},${q(`example${p.n}@example.com`)},${q(hash)},datetime('now'));`,
  );
}

/** Signs in as exampleN@example.com, or as the address given. */
async function login(n) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/v2/login`);
  await page.getByLabel("Email", { exact: true }).fill(typeof n === "string" ? n : `example${n}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  return page;
}
// A function declaration (not a const) so the --heavy mode, which runs before this line, can use it.
function call(page, path, input, mutation = true) {
  return page.evaluate(
    async ([path, input, mutation]) => {
      const url = `/api/trpc/${path}?batch=1${mutation ? "" : `&input=${encodeURIComponent(JSON.stringify({ 0: input ?? null }))}`}`;
      const res = await fetch(url, {
        method: mutation ? "POST" : "GET",
        headers: { "content-type": "application/json" },
        body: mutation ? JSON.stringify({ 0: input ?? null }) : undefined,
      });
      const j = await res.json();
      const r = Array.isArray(j) ? j[0] : j;
      if (r.error) throw new Error(`${path}: ${r.error.message ?? JSON.stringify(r.error)}`);
      return r.result.data;
    },
    [path, input, mutation],
  );
}
async function attempt(label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.log(`  skipped ${label}: ${String(e.message).slice(0, 110)}`);
  }
}

async function fill(n, spec, from, opts) {
  const p = await login(n);
  const me = people[n - 1];
  console.log(`example${n}: details`);
  await call(p, "account.setAvatar", { avatar: pics[n].avatar });
  await call(p, "account.updateBusiness", {
    businessName: me.business,
    ein: me.ein,
    address: me.address,
    paymentInstructions: me.pay,
    logo: pics[n].logo,
  });
  console.log(`example${n}: time (${from} to ${TODAY})`);
  const rows = makeEntries(spec, from);
  for (let i = 0; i < rows.length; i += 250) await call(p, "timeImport.importRows", { rows: rows.slice(i, i + 250) });
  const clients = await call(p, "clients.list", null, false);
  const byName = Object.fromEntries(clients.map((c) => [c.client_name ?? c.name, c]));
  console.log(`example${n}: clients and projects`);
  for (const s of spec) {
    const c = byName[s.client];
    if (!c) continue;
    const logo = await art(probe, initials(s.client), hueOf(s.client), 192, false);
    const rounding = ["Fable Labs", "Helios Energy", "Riverbend Dental"].includes(s.client)
      ? { rounding: { step: 15, mode: "up", min: 0 } }
      : {};
    await attempt(`client ${s.client}`, () =>
      call(p, "clients.update", {
        id: c.id,
        name: s.client,
        legalName: s.legal,
        address: s.addr,
        email: s.email,
        logo,
        ...rounding,
        ...(s.currency ? { currency: s.currency } : {}),
      }),
    );
    for (const pr of c.projects)
      await attempt(`project logo ${pr.name}`, async () =>
        call(p, "project.update", { id: pr.id, logo: await art(probe, initials(pr.name), hueOf(pr.name), 128, false) }),
      );
  }
  const fresh = await call(p, "clients.list", null, false);
  const projectId = (client, project) =>
    fresh.find((c) => c.name === client)?.projects.find((x) => x.name === project)?.id;
  for (const [client, project, amount, unit, period] of opts.budgets ?? []) {
    const id = projectId(client, project);
    if (id)
      await attempt(`budget ${project}`, () =>
        call(p, "project.update", { id, budgetAmount: amount, budgetUnit: unit, budgetPeriod: period }),
      );
  }
  for (const d of opts.nonBillable ?? [])
    await attempt(`non-billable ${d}`, () => call(p, "entry.setNonBillable", { date: d, nonBillable: true }));
  console.log(`example${n}: invoices`);
  let seq = 1;
  for (const [from2, to2, issue, due, paidOffset] of opts.invoicePeriods) {
    for (const s of spec.filter((x) => !x.internal)) {
      const c = fresh.find((x) => x.name === s.client);
      if (!c || R() < 0.15) continue;
      const number = `INV-2026-${String(seq).padStart(3, "0")}`;
      const inv = await attempt(`invoice ${number}`, () =>
        call(p, "invoice.create", {
          clientId: c.id,
          from: from2,
          to: to2,
          number,
          issueDate: issue,
          dueDate: due,
          notes: "Thank you for your business.",
          includeDetail: R() < 0.7,
          compactNotes: false,
        }),
      );
      if (inv) {
        seq++;
        const id = inv.invoice?.id ?? inv.id;
        if (id && paidOffset !== null && R() < 0.85)
          await attempt("mark paid", () =>
            call(p, "invoice.markPaid", { id, paidDate: addDays(issue, paidOffset + between(0, 6)) }),
          );
      }
    }
  }
  return p;
}

const p1 = await fill(1, MAYA, "2026-06-22", {
  budgets: [
    ["Helios Energy", "Dashboard", 80 * 60, "hours", "total"],
    ["Fable Labs", "Mobile app", 40 * 60, "hours", "month"],
    ["Northwind Studio", "Website redesign", 800000, "dollars", "total"],
    ["Meridian Health", "Patient portal", 60 * 60, "hours", "total"],
  ],
  nonBillable: ["2026-07-03", "2026-09-07", "2026-10-12"],
  invoicePeriods: [
    ["2026-07-01", "2026-07-31", "2026-08-03", "2026-09-02", 9],
    ["2026-08-01", "2026-08-31", "2026-09-02", "2026-10-02", 12],
    ["2026-09-01", "2026-09-30", "2026-10-01", "2026-10-11", 20],
    ["2026-10-01", "2026-10-15", "2026-10-16", "2026-11-15", null],
  ],
});
console.log("example1: team and shares");
const p3 = await login(3);
await attempt("pending invite", async () => {
  const cl = await call(p1, "clients.list", null, false);
  const some = cl.slice(0, 3).map((c) => c.id);
  const res = await call(p1, "team.invite", { email: "example3@example.com", name: "Example Three", clientIds: some });
  await call(p3, "member.accept", { token: res.token });
  await call(p1, "team.invite", {
    email: "pending.person@example.com",
    name: "Pending Person",
    clientIds: some.slice(0, 1),
  });
  const teams = await call(p3, "member.teams", null, false);
  const t = teams[0];
  const projects = t.clients.flatMap((c) => c.projects.map((x) => x.id));
  for (let i = 0; i < 14; i++) {
    await attempt("member log", () =>
      call(p3, "member.log", {
        teamId: t.id,
        projectId: pick(projects),
        date: addDays(TODAY, -between(1, 40)),
        minutes: pick([60, 90, 120, 180]),
        note: pick(NOTES.dev),
      }),
    );
  }
});
await attempt("sign-off link", () =>
  call(p1, "timesheetShare.create", {
    from: "2026-10-12",
    to: "2026-10-18",
    includeNotes: true,
    expiresInDays: 30,
    title: "Week of Oct 12",
  }),
);

const p2 = await fill(2, TOM, "2026-08-10", {
  budgets: [["Riverbend Dental", "Booking site", 30 * 60, "hours", "month"]],
  nonBillable: ["2026-09-07"],
  invoicePeriods: [
    ["2026-08-10", "2026-08-31", "2026-09-01", "2026-09-30", 10],
    ["2026-09-01", "2026-09-30", "2026-10-01", "2026-10-31", null],
  ],
});
void p2;
// The importer gives every client the same colour; give each its own.
const colourSql = [
  [1, MAYA],
  [2, TOM],
].flatMap(([n, spec]) =>
  spec.map((c) => `UPDATE clients SET color = ${q(c.color)} WHERE name = ${q(c.client)} AND user_id = ${q(ids[n])};`),
);
sh(colourSql.join("\n"));
await browser.close();
console.log(
  "Done. Sign in as example1@example.com, example2@example.com or example3@example.com (the password is at the top of this script).",
);

// ---------- --heavy: heavy@example.com, three years of history up to the real today ----------
async function seedHeavy() {
  const email = "heavy@example.com";
  const today = ymd(new Date());
  const start = addDays(today, -3 * 365);
  sh(`DELETE FROM auth_users WHERE email = ${q(email)};
INSERT INTO auth_users (id,name,email,password_hash,email_verified_at,business_name) VALUES (${q(randomUUID())},'Heavy Freelancer',${q(email)},${q(bcrypt.hashSync(PASSWORD, 10))},datetime('now'),'Heavy Studio');`);
  // The two example freelancers' clients plus one, each of the first twelve with an extra project: 15 and 40.
  const extra = ["Maintenance", "Discovery", "Workshops", "Analytics"];
  const spec = [...MAYA, ...TOM, { client: "Orbit Robotics", w: 2, projects: [["Control panel", 14000, "dev"]] }].map(
    (c, i) => ({
      ...c,
      projects: i < 12 ? [...c.projects, [extra[i % 4], c.internal ? 0 : 9000 + i * 500, "pm"]] : c.projects,
      // the share of the three years the client was active; four clients ended early and are archived
      from: c.internal ? 0 : R() * 0.6,
      archived: ["Bluebird Cafe", "Kite and Co", "Oakline Legal", "Studio Nine"].includes(c.client),
    }),
  );
  for (const c of spec) c.to = c.archived ? Math.min(0.95, c.from + 0.2 + R() * 0.3) : 1;
  const rows = [];
  for (let k = 0; k < 12; k++) {
    const qFrom = addDays(start, Math.round((k * 3 * 365) / 12));
    const qTo = k === 11 ? today : addDays(start, Math.round(((k + 1) * 3 * 365) / 12) - 1);
    const active = spec.filter((c) => c.from <= (k + 1) / 12 && c.to >= k / 12);
    rows.push(...makeEntries(active, qFrom, { to: qTo, perDay: [4, 7], lengths: [15, 30, 45, 60, 75, 90, 120] }));
  }
  const p = await login(email);
  const slow = async (...a) => {
    await new Promise((r) => setTimeout(r, 260)); // stays under the 240 changes a minute limit
    return call(p, ...a);
  };
  console.log(`heavy: ${rows.length} entries`);
  for (let i = 0; i < rows.length; i += 300) await slow("timeImport.importRows", { rows: rows.slice(i, i + 300) });
  const list = await call(p, "clients.list", null, false);
  const pid = (client, project) => list.find((c) => c.name === client)?.projects.find((x) => x.name === project)?.id;
  for (const [client, project, amount, unit, period] of [
    ["Northwind Studio", "Website redesign", 120 * 60, "hours", "total"],
    ["Fable Labs", "Mobile app", 40 * 60, "hours", "month"],
    ["Helios Energy", "Dashboard", 1_500_000, "dollars", "total"],
    ["Meridian Health", "Patient portal", 30 * 60, "hours", "month"],
  ]) {
    const id = pid(client, project);
    if (id) await slow("project.update", { id, budgetAmount: amount, budgetUnit: unit, budgetPeriod: period });
  }
  for (let i = 0; i < 24; i++)
    await slow("entry.setNonBillable", { date: addDays(today, -between(5, 3 * 365)), nonBillable: true });
  await heavyInvoices({ spec, rows, list, today, slow });
  console.log("heavy: archiving");
  for (const c of spec) {
    const client = list.find((x) => x.name === c.client);
    if (!client) continue;
    if (c.archived) await slow("clients.archive", { id: client.id });
    else if (R() < 0.4 && c.projects.length > 2)
      await slow("project.archive", { id: pid(c.client, c.projects.at(-1)[0]) });
  }
  console.log(`Done. Sign in as ${email} (the password is at the top of this script).`);
}

/** About three invoices a month over three years, through the real invoice.create; most of them paid. */
async function heavyInvoices({ spec, rows, list, today, slow }) {
  console.log("heavy: invoices");
  const seq = {};
  for (let m = 35; m >= 1; m--) {
    const d = parse(today);
    d.setDate(1);
    d.setMonth(d.getMonth() - m);
    const from = ymd(d);
    d.setMonth(d.getMonth() + 1);
    const issue = ymd(d);
    const to = addDays(issue, -1);
    for (const c of spec.filter((x) => !x.internal && R() < 0.35)) {
      const clientId = list.find((x) => x.name === c.client)?.id;
      if (!clientId || !rows.some((r) => r.client === c.client && r.date >= from && r.date <= to)) continue;
      const year = issue.slice(0, 4);
      seq[year] = (seq[year] ?? 0) + 1;
      const number = `INV-${year}-${String(seq[year]).padStart(3, "0")}`;
      const inv = await attempt(`invoice ${number}`, () =>
        slow("invoice.create", { clientId, from, to, number, issueDate: issue, dueDate: addDays(issue, 30) }),
      );
      const id = inv?.invoice?.id ?? inv?.id;
      if (id && m > 1 && R() < 0.9)
        await attempt("mark paid", () => slow("invoice.markPaid", { id, paidDate: addDays(issue, between(5, 40)) }));
    }
  }
}
