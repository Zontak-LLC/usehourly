import { describe, expect, it } from "vitest";

import { renderReport, runCost } from "../../scripts/perf/report.mjs";
import {
  compareRuns,
  costEstimate,
  dollars,
  headline,
  PRICES,
  pageSummary,
  percent,
  percentile,
  seconds,
  stepSummary,
  summarize,
  timeline,
} from "../../scripts/perf/stats.mjs";

/**
 * The Performance Check's numbers (scripts/perf/stats.mjs) and its report (scripts/perf/report.mjs): a run of virtual
 * people on staging becomes percentiles per step and page, a cost from Cloudflare's prices, sentences, and one
 * self-contained HTML page that can be published as a private Claude artifact.
 */
type Action = { page: string; action: string; ok: boolean; dataMs: number | null; pageMs: number };
const act = (page: string, dataMs: number | null, ok = true): Action => ({
  page,
  action: page,
  ok,
  dataMs,
  pageMs: (dataMs ?? 0) + 200,
});

function step(users: number, start: number, actions: Action[], extra: Record<string, unknown> = {}) {
  return {
    users,
    start,
    end: start + 180_000,
    actions,
    appRequests: 1800,
    serverErrors: 0,
    consoleErrors: 0,
    db: { rowsRead: 4_000_000, rowsWritten: 2_000, queries: 9_000 },
    worker: { requests: 1800, errors: 0, cpuMs: 90_000, cpuP50Ms: 12, cpuP99Ms: 140 },
    ...extra,
  };
}

const T0 = Date.UTC(2026, 9, 25, 2, 0, 0);
function sampleRun(scale = 1) {
  const pages = ["Today", "Week", "Month", "Invoices", "Year summary"];
  const many = (base: number) =>
    pages.flatMap((p, i) => [act(p, (base + i * 20) * scale), act(p, (base + i * 30) * scale)]);
  return {
    version: 1,
    base: "https://staging.usehourly.app",
    accounts: 10_000,
    minutes: 3,
    users: [10, 50],
    swarm: true,
    commit: "abc1234",
    startedAt: T0,
    endedAt: T0 + 430_000,
    measuredBy: "Cloudflare analytics (GraphQL), per minute",
    steps: [step(10, T0, many(150)), step(50, T0 + 250_000, [...many(210), act("Month", null, false)])],
    requests: [
      [1_000, 140, 200, "trpc", ["entry.list", "clients.list"]],
      [20_000, 900, 200, "doc"],
      [260_000, 300, 500, "trpc", ["invoice.list"]],
    ],
    samples: { failures: ["Month (stress-00001@stress.invalid): Timeout"], consoleErrors: [] },
  };
}

describe("percentiles and summaries", () => {
  it("interpolates between ranks, ignores missing values, and is null for nothing", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 0)).toBe(10);
    expect(percentile([50, 10, 40, 20, 30], 100)).toBe(50);
    // 1..100: p95 sits at rank 94.05 -> 95.05
    expect(
      percentile(
        Array.from({ length: 100 }, (_, i) => i + 1),
        95,
      ),
    ).toBeCloseTo(95.05, 5);
    expect(percentile([1, null as never, Number.NaN, 3], 50)).toBe(2);
    expect(summarize([300, 100, 200, null as never])).toEqual({ count: 3, median: 200, p95: 290, max: 300 });
  });

  it("a step: data time of the actions that finished, slowest page named, requests per second, failures", () => {
    const s = stepSummary(
      step(10, T0, [
        act("Today", 100),
        act("Month", 900),
        act("Week", null),
        act("Clients", 5000, false),
        act("Sign in", 6000),
      ]),
    );
    expect(s.data).toEqual({ count: 2, median: 500, p95: 860, max: 900 });
    expect(s.slowest).toEqual({ page: "Month", action: "Month", ms: 900 });
    expect(s.failed).toBe(1);
    expect(s.actions).toBe(5); // signing in is its own page, never a step's "at worst"
    expect(s.requestsPerSecond).toBe(10); // 1,800 requests in 180 s
  });

  it("per page: slowest p95 first, and a page that only failed is still listed", () => {
    const pages = pageSummary([
      act("Today", 100),
      act("Today", 120),
      act("Year summary", 800),
      act("Month", null, false),
    ]);
    expect(pages.map((p) => p.page)).toEqual(["Year summary", "Today", "Month"]);
    expect(pages[2]).toMatchObject({ page: "Month", count: 0, failed: 1 });
  });

  it("over time: slices count requests, per second, median and p95, and errors (5xx and no answer)", () => {
    const slices = timeline(
      [
        { t: 0, ms: 100, status: 200 },
        { t: 5_000, ms: 300, status: 503 },
        { t: 16_000, ms: 50, status: 0 },
      ],
      { totalMs: 29_999 },
    );
    expect(slices).toHaveLength(2);
    expect(slices[0]).toMatchObject({ t: 0, count: 2, median: 200, errors: 1 });
    expect(slices[0].perSecond).toBeCloseTo(2 / 15, 6);
    expect(slices[1]).toMatchObject({ t: 15_000, count: 1, errors: 1 });
  });

  it("compares pages by median with the previous run, in ms and percent", () => {
    const diffs = compareRuns(
      [
        { page: "Today", median: 200 },
        { page: "Gone", median: 100 },
      ] as never,
      [
        { page: "Today", median: 150 },
        { page: "New", median: 90 },
      ] as never,
    );
    expect(diffs).toEqual([{ page: "Today", before: 200, after: 150, diffMs: -50, pct: -0.25 }]);
  });
});

describe("the cost estimate from Cloudflare's published prices", () => {
  it("prices each figure per million, and says how much of the monthly allowance it used", () => {
    const c = costEstimate({ requests: 20_000, cpuMs: 1_000_000, rowsRead: 50_000_000, rowsWritten: 100_000 });
    expect(c.lines.requests.usd).toBeCloseTo(0.006, 9); // 0.02 M x $0.30
    expect(c.lines.cpuMs.usd).toBeCloseTo(0.02, 9); // 1 M ms x $0.02
    expect(c.lines.rowsRead.usd).toBeCloseTo(0.05, 9); // 50 M x $0.001
    expect(c.lines.rowsWritten.usd).toBeCloseTo(0.1, 9); // 0.1 M x $1
    expect(c.totalUsd).toBeCloseTo(0.176, 9);
    expect(c.lines.rowsWritten.share).toBeCloseTo(100_000 / PRICES.rowsWritten.included, 12);
    expect(c.lines.requests.share).toBe(0.002);
  });

  it("a figure that was not measured costs nothing and says so", () => {
    const c = costEstimate({ requests: 1_000_000 });
    expect(c.lines.rowsRead).toEqual({ used: null, usd: null, share: null });
    expect(c.totalUsd).toBeCloseTo(0.3, 9);
  });

  it("the run uses Cloudflare's own counts, and falls back to its own request count", () => {
    const run = sampleRun();
    const measured = runCost(run as never);
    expect(measured.lines.requests.used).toBe(3600);
    expect(measured.lines.rowsRead.used).toBe(8_000_000);
    run.steps[1].worker = null as never;
    run.steps[1].db = null as never;
    const counted = runCost(run as never);
    expect(counted.lines.requests.used).toBe(3600); // from appRequests
    expect(counted.lines.rowsRead.used).toBeNull();
  });
});

describe("the sentences the report leads with", () => {
  it("formats times, money and shares the way people read them", () => {
    expect(seconds(150)).toBe("0.15 s");
    expect(seconds(400)).toBe("0.4 s");
    expect(seconds(1000)).toBe("1 s");
    expect(seconds(1240)).toBe("1.2 s");
    expect(seconds(12_400)).toBe("12 s");
    expect(seconds(null as never)).toBe("n/a");
    expect(dollars(0.04)).toBe("$0.04");
    expect(dollars(0.001)).toBe("under $0.01");
    expect(dollars(0)).toBe("$0.00");
    expect(percent(0.004)).toBe("0.4%");
    expect(percent(0.000001)).toBe("under 0.01%");
    expect(percent(0.25)).toBe("25%");
  });

  it("writes the summary: each step's median and worst, errors in requests, and the cost", () => {
    const steps = [
      stepSummary(step(10, T0, [act("Today", 150), act("Week", 400)])),
      stepSummary(step(50, T0, [act("Today", 210), act("Week", 900)], { serverErrors: 0 })),
    ];
    const text = headline({ accounts: 10_000, steps, cost: { totalUsd: 0.04 } as never });
    expect(text).toBe(
      "With 10,000 accounts: at 10 people, pages took 0.28 s (median), 0.4 s at worst. At 50 people, 0.56 s and 0.9 s. 0 errors in 3,600 requests. Cost of the run: $0.04.",
    );
  });

  it("says when steps failed, the browsers logged errors, or the cost was not measured", () => {
    const steps = [
      stepSummary(step(10, T0, [act("Today", 150), act("Week", null, false)], { serverErrors: 1, consoleErrors: 2 })),
    ];
    const text = headline({ accounts: 10_000, steps, cost: null });
    expect(text).toContain("1 error in 1,800 requests.");
    expect(text).toContain("1 step of the people did not finish.");
    expect(text).toContain("The browsers logged 2 console errors.");
    expect(text).toContain("Cost of the run: not measured");
  });
});

describe("the report page", () => {
  it("follows the artifact rules: title first, no document tags, tokens with dark values, no outside files", () => {
    const html = renderReport(sampleRun() as never);
    expect(html.startsWith("<title>Performance Check</title>")).toBe(true);
    expect(html).not.toMatch(/<\/?(html|head|body)[\s>]/i);
    expect(html).not.toMatch(/<script|<link|@import|url\(/i);
    expect(html).not.toMatch(/(src|href)="https?:/i);
    expect(html).toMatch(/:root\s*{[^}]*--bg:/);
    expect(html).toContain('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {');
    expect(html).toContain(':root[data-theme="dark"] {');
    expect(html).toMatch(/body\s*{[^}]*background: var\(--bg\)/);
  });

  it("leads with the sentences, then the steps, the pages (with the 1 s line), over time, allowance and procedures", () => {
    const html = renderReport(sampleRun() as never);
    expect(html).toContain("With 10,000 accounts: at 10 people, pages took");
    expect(html).toContain("10 people</td>");
    expect(html).toContain("50 people</td>");
    expect(html).toContain(">1 s</text>");
    expect(html).toContain("Database rows written");
    expect(html).toContain("<code>entry.list</code>");
    expect(html).toContain("This is the first run");
    expect(html).toContain("Month (stress-00001@stress.invalid): Timeout");
    // charts are drawn to scale: the p95 bar of the slowest page is the widest
    const widths = [...html.matchAll(/<rect x="150" y="[\d.]+" width="([\d.]+)"[^>]*var\(--s2\)/g)].map((m) =>
      Number(m[1]),
    );
    expect(widths.length).toBeGreaterThan(0);
    expect(widths[0]).toBe(Math.max(...widths));
  });

  it("compares with the previous run and lists the commits in between", () => {
    const html = renderReport(sampleRun(0.5) as never, sampleRun() as never, ["def5678 Faster Month"]);
    expect(html).toContain("faster by");
    expect(html).toContain("def5678 Faster Month");
    expect(html).not.toContain("This is the first run");
  });

  it("escapes what came from the browser, so an error message cannot add markup", () => {
    const run = sampleRun();
    run.samples.failures = ['<img src=x onerror="alert(1)">'];
    const html = renderReport(run as never);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});
