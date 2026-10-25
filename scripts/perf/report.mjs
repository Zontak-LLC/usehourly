// Renders ONE self-contained HTML report for a Performance Check run (docs/specs/performance-check.md). It follows the
// rules for a private Claude artifact: no <html>/<head>/<body> tags, a <title> first, colours as tokens on :root with
// dark values for both the system setting and a dark theme stamp, an explicit body background, and no scripts or files
// from anywhere (the charts are inline SVG drawn to scale; hover tips are SVG <title> elements).
import {
  compareRuns,
  costEstimate,
  dollars,
  headline,
  pageSummary,
  percent,
  procedureSummary,
  seconds,
  stepSummary,
  timeline,
} from "./stats.mjs";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const n = (x) => Number(x ?? 0).toLocaleString("en-US");
const fixed = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "n/a");

const STYLE = `
:root {
  color-scheme: light;
  --bg: #f4f5f7; --card: #ffffff; --ink: #12151b; --ink-2: #4b505a; --ink-3: #7a808b;
  --line: #e3e5e9; --grid: #eceef1; --s1: #2a78d6; --s2: #eb6834; --limit: #e34948; --band: #f0f2f5;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #0f1115; --card: #181b21; --ink: #f2f3f5; --ink-2: #b9bec7; --ink-3: #868c97;
    --line: #2a2e36; --grid: #23272e; --s1: #3987e5; --s2: #d95926; --limit: #e66767; --band: #1e2128;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0f1115; --card: #181b21; --ink: #f2f3f5; --ink-2: #b9bec7; --ink-3: #868c97;
  --line: #2a2e36; --grid: #23272e; --s1: #3987e5; --s2: #d95926; --limit: #e66767; --band: #1e2128;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 26px; margin: 0 0 4px; }
h2 { font-size: 18px; margin: 0 0 12px; }
.meta { color: var(--ink-3); font-size: 13px; margin: 0 0 20px; }
.lead { font-size: 18px; line-height: 1.55; margin: 0; }
section { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin: 0 0 16px; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
th { color: var(--ink-2); font-weight: 600; }
.note { color: var(--ink-2); font-size: 13px; margin: 8px 0 0; }
.legend { display: flex; gap: 16px; font-size: 13px; color: var(--ink-2); margin: 0 0 8px; flex-wrap: wrap; }
.key { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
svg { display: block; width: 100%; height: auto; }
svg text { fill: var(--ink-2); font-size: 12px; font-family: inherit; }
.faster { color: var(--ink); } .slower { color: var(--limit); }
details summary { cursor: pointer; color: var(--ink-2); }
code { font-size: 13px; }
`;

/** A horizontal bar chart: median and p95 per page, slowest first, with the 1 s line. */
function pageBars(pages) {
  if (pages.length === 0) return `<p class="note">No page finished.</p>`;
  const W = 920;
  const left = 150;
  const right = 70;
  const rowH = 34;
  const top = 8;
  const H = top + pages.length * rowH + 28;
  const maxMs = Math.max(1000, ...pages.map((p) => p.p95 ?? 0)) * 1.08;
  const x = (ms) => left + ((W - left - right) * ms) / maxMs;
  const step = maxMs > 4000 ? 1000 : maxMs > 2000 ? 500 : 250;
  let grid = "";
  for (let t = 0; t <= maxMs; t += step)
    grid += `<line x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${H - 24}" stroke="var(--grid)"/><text x="${x(t)}" y="${H - 8}" text-anchor="middle">${seconds(t)}</text>`;
  const rows = pages
    .map((p, i) => {
      const y = top + i * rowH;
      const bar = (ms, dy, colour, label) =>
        Number.isFinite(ms)
          ? `<rect x="${left}" y="${y + dy}" width="${Math.max(2, x(ms) - left)}" height="11" rx="3" fill="${colour}"><title>${esc(p.page)}: ${label} ${seconds(ms)}</title></rect>`
          : "";
      return `<text x="${left - 10}" y="${y + 17}" text-anchor="end">${esc(p.page)}</text>
${bar(p.median, 4, "var(--s1)", "median")}${bar(p.p95, 17, "var(--s2)", "p95")}
<text x="${Math.max(x(p.p95 ?? 0), x(p.median ?? 0)) + 6}" y="${y + 21}">${seconds(p.p95)}</text>`;
    })
    .join("");
  const one = `<line x1="${x(1000)}" x2="${x(1000)}" y1="${top}" y2="${H - 24}" stroke="var(--limit)" stroke-width="2" stroke-dasharray="4 3"/><text x="${x(1000) + 4}" y="${top + 10}" style="fill:var(--limit)">1 s</text>`;
  return `<div class="legend"><span><i class="key" style="background:var(--s1)"></i>Median</span><span><i class="key" style="background:var(--s2)"></i>p95 (1 in 20 slower)</span></div>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Page data time per page, median and p95">${grid}${one}${rows}</svg>`;
}

/** A line chart over the run, with the steps shaded; `series` = [{ key, label, colour }] read from the slices. */
function lineChart(slices, steps, startedAt, series, { unit, label, format }) {
  const W = 920;
  const H = 240;
  const left = 56;
  const right = 16;
  const top = 12;
  const bottom = 30;
  const totalMs = Math.max(1, ...slices.map((s) => s.t)) + (slices[1]?.t ?? 15_000);
  const maxY = Math.max(unit === "ms" ? 1000 : 1, ...slices.flatMap((s) => series.map((k) => s[k.key] ?? 0))) * 1.1;
  const x = (t) => left + ((W - left - right) * t) / totalMs;
  const y = (v) => top + (H - top - bottom) * (1 - v / maxY);
  const bands = steps
    .map((s, i) => {
      const a = x(s.start - startedAt);
      const b = x(s.end - startedAt);
      return `<rect x="${a}" y="${top}" width="${Math.max(0, b - a)}" height="${H - top - bottom}" fill="${i % 2 ? "transparent" : "var(--band)"}"/><text x="${a + 4}" y="${top + 12}">${s.users} people</text>`;
    })
    .join("");
  let grid = "";
  for (let i = 0; i <= 4; i++) {
    const v = (maxY / 1.1) * (i / 4);
    grid += `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${left - 6}" y="${y(v) + 4}" text-anchor="end">${format(v)}</text>`;
  }
  for (let m = 0; m * 60_000 <= totalMs; m++)
    grid += `<text x="${x(m * 60_000)}" y="${H - 10}" text-anchor="middle">${m}m</text>`;
  const lines = series
    .map((k) => {
      const pts = slices.filter((s) => Number.isFinite(s[k.key])).map((s) => `${x(s.t + 7500)},${y(s[k.key])}`);
      if (pts.length === 0) return "";
      const dots = slices
        .filter((s) => Number.isFinite(s[k.key]))
        .map(
          (s) =>
            `<circle cx="${x(s.t + 7500)}" cy="${y(s[k.key])}" r="6" fill="transparent"><title>${Math.round(s.t / 1000)} s: ${k.label} ${format(s[k.key])}</title></circle>`,
        )
        .join("");
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${k.colour}" stroke-width="2" stroke-linejoin="round"/>${dots}`;
    })
    .join("");
  const legend = series
    .map((k) => `<span><i class="key" style="background:${k.colour}"></i>${esc(k.label)}</span>`)
    .join("");
  const limit =
    unit === "ms"
      ? `<line x1="${left}" x2="${W - right}" y1="${y(1000)}" y2="${y(1000)}" stroke="var(--limit)" stroke-dasharray="4 3"/>`
      : "";
  return `<div class="legend">${legend}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${bands}${grid}${limit}${lines}</svg>`;
}

/** Bars of how much of each monthly allowance the run used. */
function allowanceBars(cost) {
  const rows = [
    ["Worker requests", "requests", "10 million a month"],
    ["Worker CPU time", "cpuMs", "30 million ms a month"],
    ["Database rows read", "rowsRead", "25 billion a month"],
    ["Database rows written", "rowsWritten", "50 million a month"],
  ];
  return `<div class="scroll"><table><thead><tr><th>What</th><th>This run</th><th>Included</th><th>Share of the month</th><th></th><th>List price past it</th></tr></thead><tbody>${rows
    .map(([label, key, included]) => {
      const l = cost.lines[key];
      const width = l.share === null ? 0 : Math.max(l.share > 0 ? 2 : 0, Math.min(100, l.share * 100));
      return `<tr><td>${label}</td><td>${l.used === null ? "not measured" : n(Math.round(l.used))}</td><td>${included}</td>
<td>${percent(l.share)}</td><td><svg viewBox="0 0 120 12" width="120" height="12" style="display:inline-block;vertical-align:middle" aria-hidden="true"><rect width="120" height="12" rx="3" fill="var(--grid)"/><rect width="${(width / 100) * 120}" height="12" rx="3" fill="var(--s1)"/></svg></td>
<td>${l.usd === null ? "n/a" : dollars(l.usd)}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}

const stepRow = (s, step) => {
  const db = step.db;
  const w = step.worker;
  return `<tr><td>${s.users} people</td><td>${seconds(s.data.median)}</td><td>${seconds(s.data.p95)}</td><td>${seconds(s.data.max)}${s.slowest ? ` <span class="note">(${esc(s.slowest.page)})</span>` : ""}</td>
<td>${fixed(s.requestsPerSecond)}</td><td>${n(s.requests)}</td><td>${n(s.serverErrors)}</td><td>${n(s.failed)} of ${n(s.actions)}</td><td>${n(s.consoleErrors)}</td>
<td>${db ? n(db.rowsRead) : "n/a"}</td><td>${db ? n(db.rowsWritten) : "n/a"}</td><td>${w ? `${fixed(w.cpuP50Ms)} / ${fixed(w.cpuP99Ms)} ms` : "n/a"}</td></tr>`;
};

/** The run's cost: from Cloudflare's own counts when measured, else the requests this run counted itself. */
export function runCost(run) {
  const sum = (pick) => {
    const xs = run.steps.map(pick);
    return xs.every((v) => Number.isFinite(v)) ? xs.reduce((a, b) => a + b, 0) : null;
  };
  return costEstimate({
    requests: sum((s) => s.worker?.requests) ?? sum((s) => s.appRequests),
    cpuMs: sum((s) => s.worker?.cpuMs),
    rowsRead: sum((s) => s.db?.rowsRead),
    rowsWritten: sum((s) => s.db?.rowsWritten),
  });
}

/** The whole report for a run, compared with the previous run when there is one. */
export function renderReport(run, previous = null, commitsBetween = []) {
  const steps = run.steps.map(stepSummary);
  const allActions = run.steps.flatMap((s) => s.actions);
  const pages = pageSummary(allActions);
  const cost = runCost(run);
  const lead = headline({ accounts: run.accounts, steps, cost });
  const requests = run.requests.map(([t, ms, status]) => ({ t, ms, status }));
  const slices = timeline(requests, { totalMs: run.endedAt - run.startedAt });
  const procedures = procedureSummary(run.requests.map(([, ms, , kind, procs]) => ({ ms, kind, procedures: procs })));
  const when = new Date(run.startedAt).toISOString().replace("T", " ").slice(0, 16);

  const stepTable = `<div class="scroll"><table><thead><tr><th>Step</th><th>Median</th><th>p95</th><th>Slowest</th><th>Requests/s</th><th>Requests</th><th>Server errors</th><th>Steps failed</th><th>Console errors</th><th>DB rows read</th><th>DB rows written</th><th>Worker CPU p50 / p99</th></tr></thead><tbody>${steps
    .map((s, i) => stepRow(s, run.steps[i]))
    .join("")}</tbody></table></div>`;

  const pageTable = `<details><summary>The numbers as a table</summary><div class="scroll"><table><thead><tr><th>Page</th><th>Times measured</th><th>Median</th><th>p95</th><th>Slowest</th><th>Failed</th></tr></thead><tbody>${pages
    .map(
      (p) =>
        `<tr><td>${esc(p.page)}</td><td>${n(p.count)}</td><td>${seconds(p.median)}</td><td>${seconds(p.p95)}</td><td>${seconds(p.max)}</td><td>${n(p.failed)}</td></tr>`,
    )
    .join("")}</tbody></table></div></details>`;

  let comparison = `<p class="note">This is the first run: there is nothing to compare with yet.</p>`;
  if (previous) {
    const diffs = compareRuns(pageSummary(previous.steps.flatMap((s) => s.actions)), pages);
    const prevWhen = new Date(previous.startedAt).toISOString().replace("T", " ").slice(0, 16);
    comparison = `<p class="note">Against the run of ${esc(prevWhen)} UTC (median page data time).</p>
<div class="scroll"><table><thead><tr><th>Page</th><th>Before</th><th>Now</th><th>Change</th></tr></thead><tbody>${diffs
      .map(
        (d) =>
          `<tr><td>${esc(d.page)}</td><td>${seconds(d.before)}</td><td>${seconds(d.after)}</td><td class="${d.diffMs > 0 ? "slower" : "faster"}">${d.diffMs > 0 ? "slower" : "faster"} by ${seconds(Math.abs(d.diffMs))}${d.pct === null ? "" : ` (${Math.round(Math.abs(d.pct) * 100)}%)`}</td></tr>`,
      )
      .join("")}</tbody></table></div>
${commitsBetween.length ? `<p class="note">Commits in between:</p><ul>${commitsBetween.map((c) => `<li><code>${esc(c)}</code></li>`).join("")}</ul>` : `<p class="note">No commits in between (the same code).</p>`}`;
  }

  const problems = [...(run.samples?.failures ?? []), ...(run.samples?.consoleErrors ?? [])];
  const procTable = procedures.length
    ? `<div class="scroll"><table><thead><tr><th>Procedure</th><th>Calls</th><th>Median</th><th>p95</th><th>Slowest</th></tr></thead><tbody>${procedures
        .slice(0, 15)
        .map(
          (p) =>
            `<tr><td><code>${esc(p.name)}</code></td><td>${n(p.count)}</td><td>${seconds(p.median)}</td><td>${seconds(p.p95)}</td><td>${seconds(p.max)}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table></div><p class="note">The time of the HTTP request that carried the procedure; a batch carries several.</p>`
    : `<p class="note">No tRPC requests were recorded.</p>`;

  return `<title>Performance Check</title>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${STYLE}</style>
<main>
<h1>Performance Check</h1>
<p class="meta">${esc(when)} UTC · ${esc(run.base)} · ${run.minutes} min per step · code ${esc(run.commit ?? "unknown")} · swarm pass ${run.swarm ? "on" : "off (normal limits)"} · database figures: ${esc(run.measuredBy)}</p>
<section><p class="lead">${esc(lead)}</p>
<p class="note">Page time here is the page data time: how long the page's tRPC request took, from the browser. Each person signs in as a test account (light, regular or heavy) and goes through Today, logging time, another day, search, Week and its export, Month, Invoices, Clients, the Year summary, and on regular and heavy accounts one new invoice.</p></section>
<section><h2>Per step</h2>${stepTable}</section>
<section><h2>Per page</h2>${pageBars(pages)}${pageTable}</section>
<section><h2>Response time over the run</h2>${lineChart(
    slices,
    run.steps,
    run.startedAt,
    [
      { key: "median", label: "Median", colour: "var(--s1)" },
      { key: "p95", label: "p95", colour: "var(--s2)" },
    ],
    { unit: "ms", label: "Response time of the app's requests every 15 seconds", format: seconds },
  )}<p class="note">Every request the app answered (pages and tRPC, not static files), in 15-second slices. The dashed line is 1 s.</p></section>
<section><h2>Requests per second</h2>${lineChart(
    slices,
    run.steps,
    run.startedAt,
    [{ key: "perSecond", label: "Requests per second", colour: "var(--s1)" }],
    { unit: "rps", label: "Requests per second every 15 seconds", format: (v) => fixed(v) },
  )}</section>
<section><h2>Database and Worker use against the monthly allowance</h2>${allowanceBars(cost)}
<p class="note">Cost of the run at list price past the allowance: ${dollars(cost.totalUsd)}. Prices: Cloudflare Workers Paid (10 million requests and 30 million CPU ms included, then $0.30 per million requests and $0.02 per million CPU ms; D1 25 billion rows read and 50 million rows written included, then $0.001 per million reads and $1 per million writes).</p></section>
<section><h2>Slowest tRPC procedures</h2>${procTable}</section>
<section><h2>Compared with the last run</h2>${comparison}</section>
${problems.length ? `<section><h2>What went wrong (first ${problems.length})</h2><ul>${problems.map((p) => `<li><code>${esc(p)}</code></li>`).join("")}</ul></section>` : ""}
</main>
`;
}
