// The Performance Check (docs/specs/performance-check.md): virtual people in real browsers sign in as stress-test
// accounts on STAGING and use the app the way people do, in steps of 10, 25 and 50 people at once. It records the page
// data time of every step (from the tRPC request timings), requests per second, server errors and console errors,
// reads the database and Worker figures for the run from Cloudflare, and writes .perf/runs/<time>.json and one
// self-contained .perf/runs/<time>.html report.
//
//   npm run perf-check -- --users=10,25,50 --minutes=3
//
// Staging only: any other address is refused. The accounts are the stress accounts of `npm run stress:seed`; their
// password is read from .stress/password and never printed. With the swarm pass (SWARM_TOKEN on the staging Worker,
// the same value in the SWARM_TOKEN variable here or in the Keychain as usehourly-staging-swarm-token), the test
// accounts skip the per-account write limit and the login throttle; without it the normal limits apply, so more than
// about 40 sign-ins in 15 minutes from this machine are refused.
//
// Each run logs a few 15-minute entries ("perf check") and, on regular and heavy accounts, makes one invoice per person
// per step: test data on staging only.
import { chromium } from "@playwright/test";

import { renderReport } from "./perf/report.mjs";
import { emailFor, profileOf } from "./stress/seed.mjs";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const STAGING = "https://staging.usehourly.app";
const ALLOWED_HOSTS = new Set(["staging.usehourly.app"]);
const OUT = ".perf/runs";
const SWARM_HEADER = "x-swarm-token";
const SETTLE_MS = 400;
const ACTION_TIMEOUT = 30_000;
const COOL_DOWN_MS = 70_000; // between steps, so Cloudflare's per-minute figures never mix two steps
const SEARCH_WORDS = ["review", "planning", "bug", "deploy", "proposal", "sync"];

const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const base = arg("base", process.env.STAGING_URL ?? STAGING).replace(/\/+$/, "");
const users = arg("users", "10,25,50")
  .split(",")
  .map(Number)
  .filter((x) => Number.isInteger(x) && x > 0);
const minutes = Number(arg("minutes", 3));

function refuse(message) {
  console.error(message);
  process.exit(2);
}
let host;
try {
  host = new URL(base).hostname;
} catch {
  refuse(`Not an address: ${base}`);
}
if (!ALLOWED_HOSTS.has(host) || new URL(base).protocol !== "https:")
  refuse(
    `Refusing ${base}: the Performance Check runs against ${STAGING} only (never production, never anywhere else).`,
  );
if (users.length === 0 || users.some((u) => u > 200))
  refuse("--users must be whole numbers from 1 to 200, e.g. 10,25,50.");
if (!(minutes > 0 && minutes <= 30)) refuse("--minutes must be more than 0 and at most 30.");

const readText = (file) => (existsSync(file) ? readFileSync(file, "utf8").trim() : "");
const password = process.env.STRESS_PASSWORD ?? readText(".stress/password");
if (!password) refuse("No stress password: .stress/password is missing (made by npm run stress:seed).");
const manifest = existsSync(".stress/manifest.json") ? JSON.parse(readFileSync(".stress/manifest.json", "utf8")) : {};
const accounts = manifest.accounts ?? 10_000;
const seed = manifest.seed ?? 20261023;

function secretFromKeychain(name) {
  try {
    return execFileSync("security", ["find-generic-password", "-s", name, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}
const swarmToken = process.env.SWARM_TOKEN ?? secretFromKeychain("usehourly-staging-swarm-token");

/** The accounts the people use, the same on every run: 4 light, 4 regular, 2 heavy in each 10. */
function pickAccounts(count) {
  const pools = { light: [], regular: [], heavy: [] };
  for (let i = 1; i <= accounts; i++) {
    const p = profileOf(i, seed);
    if (pools[p]) pools[p].push(i);
  }
  const order = ["light", "regular", "light", "heavy", "regular", "light", "regular", "light", "heavy", "regular"];
  const used = { light: 0, regular: 0, heavy: 0 };
  return Array.from({ length: count }, (_, k) => {
    const profile = order[k % order.length];
    const pool = pools[profile];
    const n = pool[used[profile]++ % pool.length];
    return { n, email: emailFor(n), profile };
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(1000 + Math.random() * 2000);

/** Everything one run records. */
const run = {
  version: 1,
  base,
  accounts,
  minutes,
  users,
  swarm: !!swarmToken,
  commit: gitOut(["rev-parse", "--short", "HEAD"]),
  startedAt: Date.now(),
  endedAt: 0,
  measuredBy: "not measured",
  steps: [],
  // [t (ms since start), ms, status, kind ("trpc" | "doc" | "app"), procedures?]
  requests: [],
  samples: { failures: [], consoleErrors: [] },
};

function gitOut(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

const isStatic = (url) =>
  /\/_next\/static\/|\.(js|css|woff2?|png|jpe?g|svg|webp|ico|map|txt|webmanifest)(\?|$)/.test(url);
const procedures = (url) => {
  const m = /\/api\/trpc\/([^?]+)/.exec(url);
  return m ? decodeURIComponent(m[1]).split(",") : null;
};

/** One virtual person: a browser context signed in to one stress account. */
async function person(browser, account, step, stopAt) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    timezoneId: "UTC", // the seed's dates are UTC; e2e's today() helper is UTC too (issue 310)
    acceptDownloads: true,
  });
  if (swarmToken)
    await context.route(`${base}/api/**`, (route) =>
      route.continue({ headers: { ...route.request().headers(), [SWARM_HEADER]: swarmToken } }),
    );
  const page = await context.newPage();
  page.setDefaultTimeout(ACTION_TIMEOUT);
  const started = new Map();
  const trpc = []; // { start, end } for this person, to work out each action's data time
  const pending = new Set(); // start times of tRPC requests still open
  let lastDone = 0;

  page.on("request", (req) => {
    const url = req.url();
    if (new URL(url).hostname !== host || isStatic(url)) return;
    started.set(req, performance.now());
    if (url.includes("/api/trpc/")) pending.add(started.get(req));
  });
  const finish = async (req, failed) => {
    const t0 = started.get(req);
    if (t0 === undefined) return;
    started.delete(req);
    const url = req.url();
    const end = performance.now();
    let status = 0;
    if (!failed) status = (await req.response().catch(() => null))?.status() ?? 0;
    const kind = url.includes("/api/trpc/") ? "trpc" : req.resourceType() === "document" ? "doc" : "app";
    const t = Math.round(Date.now() - (end - t0) - run.startedAt);
    run.requests.push([t, Math.round(end - t0), status, kind, kind === "trpc" ? procedures(url) : undefined]);
    step.appRequests++;
    // A download the browser aborts on purpose is not a server error; a 5xx or no answer at all is.
    if (status >= 500 || (failed && !/aborted/i.test(req.failure()?.errorText ?? ""))) {
      step.serverErrors++;
      if (run.samples.failures.length < 20) run.samples.failures.push(`${status || "no answer"} ${url.slice(0, 160)}`);
    }
    if (kind === "trpc") {
      trpc.push({ start: t0, end });
      pending.delete(t0);
      lastDone = end;
    }
  };
  page.on("requestfinished", (req) => void finish(req, false));
  page.on("requestfailed", (req) => void finish(req, true));
  const consoleError = (text) => {
    step.consoleErrors++;
    if (run.samples.consoleErrors.length < 20) run.samples.consoleErrors.push(`console: ${text.slice(0, 200)}`);
  };
  page.on("console", (m) => m.type() === "error" && consoleError(m.text()));
  page.on("pageerror", (e) => consoleError(String(e.message ?? e)));

  /** Waits until no tRPC request is open and none finished in the last moment (or nothing came). */
  async function settled(t0) {
    const limit = t0 + ACTION_TIMEOUT;
    await sleep(150);
    while (performance.now() < limit) {
      const now = performance.now();
      // Only this action's requests count, and one left open for over 10 s (a stuck request) stops holding it.
      const open = [...pending].some((start) => start >= t0 && now - start < 10_000);
      if (!open && now - Math.max(lastDone, t0) >= SETTLE_MS) return;
      await sleep(50);
    }
  }

  async function measure(action, pageName, fn) {
    const t0 = performance.now();
    const record = { person: account.n, profile: account.profile, action, page: pageName, ok: true };
    try {
      await fn();
      await settled(t0);
    } catch (err) {
      record.ok = false;
      record.error = String(err?.message ?? err)
        .split("\n")[0]
        .slice(0, 200);
      if (run.samples.failures.length < 20) run.samples.failures.push(`${action} (${account.email}): ${record.error}`);
    }
    const t1 = performance.now();
    const mine = trpc.filter((r) => r.start >= t0 && r.start <= t1);
    record.start = Math.round(Date.now() - (t1 - t0) - run.startedAt);
    record.pageMs = Math.round(t1 - t0);
    record.dataMs = mine.length
      ? Math.round(Math.max(...mine.map((r) => r.end)) - Math.min(...mine.map((r) => r.start)))
      : null;
    step.actions.push(record);
    return record.ok;
  }

  const heading = (name) => page.getByRole("heading", { level: 1 }).filter({ hasText: name }).first().waitFor();
  const open = (pathname, name) => async () => {
    await page.goto(base + pathname);
    await heading(name);
  };

  const signedIn = await measure("Sign in", "Sign in", async () => {
    await page.goto(`${base}/auth/v2/login`);
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: /log in|sign in/i })
      .first()
      .click();
    await page.waitForURL(/\/dashboard\//);
  });
  if (!signedIn) {
    await context.close();
    return;
  }

  let invoiced = false;
  let round = 0;
  const actions = [
    ["Today", "Today", open("/dashboard/today", "Today")],
    [
      "Log time",
      "Today",
      async () => {
        await page.getByLabel("Time to add").fill("0:15");
        await page.getByLabel("Description").fill("perf check");
        const saved = page.waitForResponse((r) => r.url().includes("entry.create"));
        await page.getByRole("button", { name: /^Log time/ }).click();
        await saved;
      },
    ],
    ["Another day", "Today", () => page.getByRole("button", { name: /^Previous day/ }).click()],
    [
      "Search",
      "Search",
      async () => {
        await page.keyboard.press("ControlOrMeta+k");
        const box = page.getByRole("combobox", { name: /Search pages, settings/ });
        const found = page.waitForResponse((r) => r.url().includes("entry.search"));
        await box.fill(SEARCH_WORDS[(account.n + round) % SEARCH_WORDS.length]);
        await found;
        await page.keyboard.press("Escape");
      },
    ],
    ["Week", "Week", open("/dashboard/week", "Weekly timesheet")],
    [
      "Export",
      "Week",
      async () => {
        await page.getByRole("button", { name: /^Export/ }).click();
        const download = page.waitForEvent("download");
        await page.getByRole("menuitem", { name: /as CSV/ }).click();
        await (await download).delete();
      },
    ],
    ["Month", "Month", open("/dashboard/month", /20\d\d/)],
    ["Invoices", "Invoices", open("/dashboard/invoices", "Invoices")],
    ["Clients", "Clients", open("/dashboard/clients", "Clients")],
    ["Year summary", "Year summary", open("/dashboard/report", /Year summary|20\d\d/)],
  ];
  const makeInvoice = async () => {
    await page.goto(`${base}/dashboard/invoices/new`);
    const create = page.getByRole("button", { name: /Create invoice/ }).first();
    await create.waitFor();
    if (await create.isDisabled()) return; // nothing left to bill on this client: a normal state, not a failure
    const download = page.waitForEvent("download").catch(() => null);
    const made = page.waitForResponse((r) => r.url().includes("invoice.create"));
    await create.click();
    await made;
    await (await download)?.delete();
  };

  while (Date.now() < stopAt) {
    for (const [action, name, fn] of actions) {
      if (Date.now() >= stopAt) break;
      const ok = await measure(action, name, fn);
      if (!ok) await page.goto(`${base}/dashboard/today`).catch(() => null); // start the round again from Today
      await think();
    }
    if (!invoiced && account.profile !== "light" && Date.now() < stopAt) {
      invoiced = true;
      await measure("Make invoice", "New invoice", makeInvoice);
      await think();
    }
    round++;
  }
  await context.close();
}

async function runStep(browser, count) {
  const step = {
    users: count,
    start: Date.now(),
    end: 0,
    actions: [],
    appRequests: 0,
    serverErrors: 0,
    consoleErrors: 0,
    db: null,
    worker: null,
  };
  run.steps.push(step);
  const stopAt = step.start + minutes * 60_000;
  const people = pickAccounts(count);
  console.log(`${new Date().toISOString().slice(11, 19)} step: ${count} people for ${minutes} min`);
  // People arrive over the first 10 seconds, not all in the same instant.
  await Promise.all(
    people.map(async (a, i) => {
      await sleep((10_000 * i) / count);
      await person(browser, a, step, stopAt).catch((err) => {
        if (run.samples.failures.length < 20)
          run.samples.failures.push(`person ${a.email}: ${String(err).slice(0, 160)}`);
      });
    }),
  );
  step.end = Date.now();
  const ok = step.actions.filter((a) => a.ok).length;
  console.log(
    `  ${ok} of ${step.actions.length} steps ok, ${step.appRequests} requests, ${step.serverErrors} server errors`,
  );
}

// ---- Cloudflare figures for the run ----------------------------------------------------------------------------

function stagingIds() {
  const text = readText("wrangler.staging.jsonc").replace(/^\s*\/\/.*$/gm, "");
  return {
    account: /"account_id"\s*:\s*"([^"]+)"/.exec(text)?.[1],
    database: /"database_id"\s*:\s*"([^"]+)"/.exec(text)?.[1],
    databaseName: /"database_name"\s*:\s*"([^"]+)"/.exec(text)?.[1],
    script: /"name"\s*:\s*"([^"]+)"/.exec(text)?.[1],
  };
}

const QUERY = `query($a:String!,$db:String!,$script:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){
d1AnalyticsAdaptiveGroups(limit:1000,filter:{databaseId:$db,datetimeMinute_geq:$s,datetimeMinute_leq:$e}){sum{rowsRead rowsWritten readQueries writeQueries}}
workersInvocationsAdaptive(limit:1000,filter:{scriptName:$script,datetime_geq:$s,datetime_leq:$e}){sum{requests errors cpuTimeUs} quantiles{cpuTimeP50 cpuTimeP99}}}}}`;

async function graphql(token, variables) {
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.data || body.errors?.length) return null;
  return body.data.viewer.accounts[0];
}

const minuteFloor = (ms) => new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
const minuteCeil = (ms) => new Date(Math.ceil(ms / 60_000) * 60_000).toISOString();

async function cloudflareFigures() {
  const ids = stagingIds();
  if (!ids.account || !ids.database || !ids.script) return;
  const tokens = [
    process.env.CLOUDFLARE_READ_TOKEN,
    secretFromKeychain("cloudflare-loader-logs-token"),
    process.env.CLOUDFLARE_API_TOKEN,
  ].filter(Boolean);
  const variables = (s) => ({
    a: ids.account,
    db: ids.database,
    script: ids.script,
    s: minuteFloor(s.start),
    e: minuteCeil(s.end),
  });
  let token = null;
  for (const t of tokens) {
    if (await graphql(t, variables(run.steps[0]))) {
      token = t;
      break;
    }
  }
  if (token) {
    // Cloudflare's analytics arrive a minute or two late: wait, then read each step, once more if a step looks empty.
    console.log("Waiting 2 minutes for Cloudflare's figures…");
    await sleep(120_000);
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const step of run.steps) {
        const data = await graphql(token, variables(step));
        if (!data) continue;
        const d1 = data.d1AnalyticsAdaptiveGroups.reduce(
          (a, g) => ({
            rowsRead: a.rowsRead + g.sum.rowsRead,
            rowsWritten: a.rowsWritten + g.sum.rowsWritten,
            queries: a.queries + g.sum.readQueries + g.sum.writeQueries,
          }),
          { rowsRead: 0, rowsWritten: 0, queries: 0 },
        );
        const w = data.workersInvocationsAdaptive[0];
        step.db = d1;
        step.worker = w
          ? {
              requests: w.sum.requests,
              errors: w.sum.errors,
              cpuMs: w.sum.cpuTimeUs / 1000,
              cpuP50Ms: w.quantiles.cpuTimeP50 / 1000,
              cpuP99Ms: w.quantiles.cpuTimeP99 / 1000,
            }
          : null;
      }
      if (run.steps.every((s) => (s.worker?.requests ?? 0) >= s.appRequests * 0.8)) break;
      await sleep(90_000);
    }
    run.measuredBy = "Cloudflare analytics (GraphQL), per minute";
    return;
  }
  // Fallback: wrangler's query insights for the whole run (rows read and written by the queries it saw).
  try {
    const minutesBack = Math.ceil((Date.now() - run.startedAt) / 60_000) + 1;
    const out = execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "insights",
        ids.databaseName,
        "--config",
        "wrangler.staging.jsonc",
        "--time-period",
        `${minutesBack}m`,
        "--json",
        "--limit",
        "100",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const rows = JSON.parse(out);
    const sum = (k) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    const total = {
      rowsRead: sum("totalRowsRead"),
      rowsWritten: sum("totalRowsWritten"),
      queries: sum("numberOfTimesRun"),
    };
    // Insights cover the whole run: share them out by each step's requests.
    const all = run.steps.reduce((a, s) => a + s.appRequests, 0) || 1;
    for (const s of run.steps)
      s.db = {
        rowsRead: Math.round((total.rowsRead * s.appRequests) / all),
        rowsWritten: Math.round((total.rowsWritten * s.appRequests) / all),
        queries: Math.round((total.queries * s.appRequests) / all),
      };
    run.measuredBy = "wrangler d1 insights (top 100 queries, shared out by requests)";
  } catch {
    run.measuredBy = "not measured";
  }
}

// ---- the run ---------------------------------------------------------------------------------------------------

function previousRun() {
  if (!existsSync(OUT)) return null;
  const files = readdirSync(OUT)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const last = files.at(-1);
  return last ? JSON.parse(readFileSync(path.join(OUT, last), "utf8")) : null;
}

const health = await fetch(`${base}/api/health`).catch(() => null);
if (health?.status !== 200) refuse(`${base}/api/health did not answer 200: is staging up?`);
if (!swarmToken)
  console.warn(
    "No swarm token (SWARM_TOKEN or the Keychain item usehourly-staging-swarm-token): the normal limits apply, so more than about 40 sign-ins in 15 minutes are refused.",
  );

const previous = previousRun();
const browser = await chromium.launch({ headless: true });
try {
  for (const [i, count] of users.entries()) {
    if (i > 0) {
      console.log(`Resting ${COOL_DOWN_MS / 1000} s between steps…`);
      await sleep(COOL_DOWN_MS);
    }
    await runStep(browser, count);
  }
} finally {
  await browser.close();
}
run.endedAt = Date.now();
run.requests.sort((a, b) => a[0] - b[0]);
await cloudflareFigures();

mkdirSync(OUT, { recursive: true });
const stamp = new Date(run.startedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
const commits =
  previous?.commit && run.commit && previous.commit !== run.commit
    ? (gitOut(["log", "--oneline", `${previous.commit}..${run.commit}`]) ?? "").split("\n").filter(Boolean).slice(0, 30)
    : [];
writeFileSync(path.join(OUT, `${stamp}.json`), JSON.stringify(run));
const html = renderReport(run, previous, commits);
const htmlPath = path.join(OUT, `${stamp}.html`);
writeFileSync(htmlPath, html);
const lead = /<p class="lead">([^<]*)<\/p>/.exec(html)?.[1] ?? "";
console.log(`\n${lead.replace(/&amp;/g, "&")}\n\nReport: ${path.resolve(htmlPath)}`);
