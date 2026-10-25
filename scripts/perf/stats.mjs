// The numbers behind the Performance Check report (docs/specs/performance-check.md): percentiles, the cost estimate
// from Cloudflare's published prices, the per-step and per-page summaries, the comparison with the last run, and the
// plain sentences the report leads with. Pure functions only (no browser, no network), so they are tested on their own
// (src/__tests__/perf-check-journey.test.ts).

/**
 * Cloudflare's published prices (Workers Paid, checked 2026-10-24). The monthly plan includes the first part of each;
 * past it, each unit costs the price below.
 */
export const PRICES = {
  requests: { included: 10_000_000, usdPerMillion: 0.3 },
  cpuMs: { included: 30_000_000, usdPerMillion: 0.02 },
  rowsRead: { included: 25_000_000_000, usdPerMillion: 0.001 },
  rowsWritten: { included: 50_000_000, usdPerMillion: 1 },
};

/** The p-th percentile (0 to 100) of the numbers, by linear interpolation between closest ranks; null when empty. */
export function percentile(values, p) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  if (xs.length === 1) return xs[0];
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (xs.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return xs[lo] + (xs[hi] - xs[lo]) * (rank - lo);
}

/** Count, median, p95 and the slowest of a list of times in ms (nulls and failed values left out). */
export function summarize(values) {
  const xs = values.filter((v) => Number.isFinite(v));
  return {
    count: xs.length,
    median: percentile(xs, 50),
    p95: percentile(xs, 95),
    max: xs.length ? Math.max(...xs) : null,
  };
}

/**
 * What the run would cost past the monthly allowance (list price), and how much of each monthly allowance it used.
 * A figure that was not measured (null) costs nothing and is reported as not measured.
 * @typedef {{ used: number | null, usd: number | null, share: number | null }} CostLine
 * @param {{ requests?: number | null, cpuMs?: number | null, rowsRead?: number | null, rowsWritten?: number | null }} used
 * @returns {{ lines: Record<"requests" | "cpuMs" | "rowsRead" | "rowsWritten", CostLine>, totalUsd: number }}
 */
export function costEstimate({ requests = null, cpuMs = null, rowsRead = null, rowsWritten = null }) {
  const used = { requests, cpuMs, rowsRead, rowsWritten };
  /** @type {Record<string, CostLine>} */
  const lines = {};
  let totalUsd = 0;
  for (const [key, price] of Object.entries(PRICES)) {
    const n = used[key];
    if (n === null || n === undefined || !Number.isFinite(n)) {
      lines[key] = { used: null, usd: null, share: null };
      continue;
    }
    const usd = (n / 1_000_000) * price.usdPerMillion;
    totalUsd += usd;
    lines[key] = { used: n, usd, share: n / price.included };
  }
  return { lines, totalUsd };
}

/** "0.15 s", "0.4 s", "1.2 s", "12 s". */
export function seconds(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "n/a";
  const s = ms / 1000;
  if (s >= 10) return `${Math.round(s)} s`;
  const fixed = s < 1 ? s.toFixed(2) : s.toFixed(1);
  return `${fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")} s`;
}

/** "$0.04"; under a cent shows as "under $0.01" so a real (tiny) cost never reads as free. */
export function dollars(usd) {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.005) return "under $0.01";
  return `$${usd.toFixed(2)}`;
}

/** "0.4%", "under 0.01%". */
export function percent(share) {
  if (share === null || share === undefined || !Number.isFinite(share)) return "n/a";
  const p = share * 100;
  if (p === 0) return "0%";
  if (p < 0.01) return "under 0.01%";
  return `${p < 1 ? p.toFixed(2).replace(/0$/, "") : p.toFixed(1).replace(/\.0$/, "")}%`;
}

const count = (n) => Number(n ?? 0).toLocaleString("en-US");

/** The times an action measured: page data time (from the tRPC requests) when it made one, else nothing. */
const dataTimes = (actions) => actions.filter((a) => a.ok).map((a) => a.dataMs);
/** Signing in (a deliberately slow password check) is reported as its own page, not in a step's page times. */
export const SIGN_IN = "Sign in";

/** One step (10, 25 or 50 people): its time figures, requests per second and errors. */
export function stepSummary(step) {
  const seconds = Math.max(1, (step.end - step.start) / 1000);
  const pages = step.actions.filter((a) => a.page !== SIGN_IN);
  const slowest = [...pages].filter((a) => a.ok && Number.isFinite(a.dataMs)).sort((a, b) => b.dataMs - a.dataMs)[0];
  return {
    users: step.users,
    data: summarize(dataTimes(pages)),
    page: summarize(pages.filter((a) => a.ok).map((a) => a.pageMs)),
    slowest: slowest ? { page: slowest.page, action: slowest.action, ms: slowest.dataMs } : null,
    actions: step.actions.length,
    failed: step.actions.filter((a) => !a.ok).length,
    requests: step.appRequests,
    requestsPerSecond: step.appRequests / seconds,
    timedOut: step.actions.filter((a) => !a.ok && a.kind === "timeout").length,
    serverErrors: step.serverErrors,
    consoleErrors: step.consoleErrors,
    machine: step.machine ?? null,
  };
}

/** Per page (over the whole run, or one step): median and p95 of the data time, slowest first. */
export function pageSummary(actions) {
  const byPage = new Map();
  for (const a of actions) {
    if (!byPage.has(a.page)) byPage.set(a.page, []);
    byPage.get(a.page).push(a);
  }
  return [...byPage.entries()]
    .map(([page, list]) => ({ page, ...summarize(dataTimes(list)), failed: list.filter((a) => !a.ok).length }))
    .filter((p) => p.count > 0 || p.failed > 0)
    .sort((a, b) => (b.p95 ?? -1) - (a.p95 ?? -1));
}

/** Per tRPC procedure: how often it was called and how long its request took (a batch counts for each procedure). */
export function procedureSummary(requests) {
  const byName = new Map();
  for (const r of requests) {
    if (r.kind !== "trpc" || !r.procedures) continue;
    for (const name of r.procedures) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(r.ms);
    }
  }
  return [...byName.entries()]
    .map(([name, ms]) => ({ name, ...summarize(ms) }))
    .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0));
}

/**
 * Requests in time slices (default 15 s) over the run: how many, per second, the median and p95 response time, and
 * server errors. `requests` are { t (ms since the run started), ms, status }.
 * @param {{ t: number, ms: number, status: number }[]} requests
 * @param {{ bucketMs?: number, totalMs?: number }} [options]
 */
export function timeline(requests, { bucketMs = 15_000, totalMs } = {}) {
  const end = totalMs ?? Math.max(0, ...requests.map((r) => r.t));
  const n = Math.max(1, Math.ceil((end + 1) / bucketMs));
  const slices = Array.from({ length: n }, (_, i) => ({ t: i * bucketMs, times: [], errors: 0, count: 0 }));
  for (const r of requests) {
    const s = slices[Math.min(n - 1, Math.max(0, Math.floor(r.t / bucketMs)))];
    s.count++;
    if (Number.isFinite(r.ms)) s.times.push(r.ms);
    if (r.status === 0 || r.status >= 500) s.errors++;
  }
  return slices.map((s) => ({
    t: s.t,
    count: s.count,
    perSecond: s.count / (bucketMs / 1000),
    median: percentile(s.times, 50),
    p95: percentile(s.times, 95),
    errors: s.errors,
  }));
}

/** Each page faster or slower than in the previous run, by median data time. */
export function compareRuns(previous, current) {
  const before = new Map(previous.map((p) => [p.page, p]));
  return current
    .filter((p) => before.has(p.page) && Number.isFinite(p.median) && Number.isFinite(before.get(p.page).median))
    .map((p) => {
      const was = before.get(p.page).median;
      const diff = p.median - was;
      return { page: p.page, before: was, after: p.median, diffMs: diff, pct: was > 0 ? diff / was : null };
    });
}

/** The total server errors of a run: answers of 500 and up, and requests that got no answer at all. */
export const totalErrors = (steps) => steps.reduce((n, s) => n + s.serverErrors, 0);

/**
 * The summary in words, the way the report leads:
 * "With 10,000 accounts: at 10 people, pages took 0.15 s (median), 0.4 s at worst. At 50 people, 0.21 s and 0.9 s.
 *  0 errors in 18,400 requests. Cost of the run: $0.04."
 */
export function headline({ accounts, steps, cost }) {
  const parts = [];
  steps.forEach((s, i) => {
    const median = seconds(s.data.median);
    const worst = seconds(s.data.max);
    if (s.data.count === 0) parts.push(`${i === 0 ? "at" : "At"} ${s.users} people, no page finished.`);
    else if (i === 0) parts.push(`at ${s.users} people, pages took ${median} (median), ${worst} at worst.`);
    else parts.push(`At ${s.users} people, ${median} and ${worst}.`);
  });
  const requests = steps.reduce((n, s) => n + s.requests, 0);
  const errors = steps.reduce((n, s) => n + s.serverErrors, 0);
  const failed = steps.reduce((n, s) => n + s.failed, 0);
  const consoleErrors = steps.reduce((n, s) => n + s.consoleErrors, 0);
  const sentences = [
    `With ${count(accounts)} accounts: ${parts.join(" ")}`,
    `${count(errors)} ${errors === 1 ? "error" : "errors"} in ${count(requests)} requests.`,
  ];
  const timedOut = steps.reduce((n, s) => n + (s.timedOut ?? 0), 0);
  if (failed > 0)
    sentences.push(
      `${count(failed)} ${failed === 1 ? "step" : "steps"} of the people did not finish${timedOut ? ` (${count(timedOut)} timed out)` : ""}.`,
    );
  if (consoleErrors > 0)
    sentences.push(`The browsers logged ${count(consoleErrors)} console ${consoleErrors === 1 ? "error" : "errors"}.`);
  const busy = overloadedSteps(steps);
  const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
  if (busy.length === 1)
    sentences.push(
      `The test machine was overloaded (load ${Math.round(busy[0].load)} on ${busy[0].cores} cores) at ${busy[0].users} people; treat that step's times with care.`,
    );
  else if (busy.length > 1)
    sentences.push(
      `The test machine was overloaded (load ${list(busy.map((o) => Math.round(o.load)))} on ${busy[0].cores} cores) at ${list(busy.map((o) => o.users))} people; treat those steps' times with care.`,
    );
  sentences.push(
    cost ? `Cost of the run: ${dollars(cost.totalUsd)}.` : "Cost of the run: not measured (no Cloudflare figures).",
  );
  return sentences.join(" ");
}

/** The server's own time from a Server-Timing header ("db;dur=12, app;dur=30.5" -> 42.5), or null without one. */
export function serverTiming(header) {
  if (!header) return null;
  const durs = [...String(header).matchAll(/(?:^|;)\s*dur=([\d.]+)/g)].map((m) => Number(m[1]));
  return durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) * 10) / 10 : null;
}

/**
 * What a failed tRPC answer says, without anything private: per call the tRPC code ("INTERNAL_SERVER_ERROR"), the
 * procedure path, and the start of the message (the server's words, cut short). A body that is not tRPC JSON (a
 * Cloudflare error page) is described by its kind only.
 */
export function trpcErrorDetail(body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    const text = String(body ?? "").trim();
    if (!text) return { codes: [], paths: [], message: "empty answer" };
    const title = /<title>([^<]{0,80})/i.exec(text)?.[1];
    return { codes: [], paths: [], message: title ? `HTML page: ${title.trim()}` : "not JSON" };
  }
  const items = (Array.isArray(parsed) ? parsed : [parsed]).map((x) => x?.error).filter(Boolean);
  const pick = (e) => e.json ?? e;
  return {
    codes: [...new Set(items.map((e) => pick(e).data?.code).filter(Boolean))],
    paths: [...new Set(items.map((e) => pick(e).data?.path).filter(Boolean))],
    message:
      items
        .map((e) => String(pick(e).message ?? ""))
        .find(Boolean)
        ?.slice(0, 160) ?? null,
  };
}

/** Time to first byte of the app's requests during one step: how long the server (plus the network) took. */
export function ttfbSummary(requests, step, startedAt) {
  const from = step.start - startedAt;
  const to = step.end - startedAt;
  return summarize(requests.filter((r) => r[0] >= from && r[0] <= to).map((r) => r[5]));
}

/** "the test machine was overloaded (load 24 on 10 cores) at 50 people" for each step whose load passed the cores. */
export function overloadedSteps(steps) {
  return steps
    .filter((s) => s.machine && s.machine.loadMax > s.machine.cores)
    .map((s) => ({ users: s.users, load: s.machine.loadMax, cores: s.machine.cores }));
}
