// How fast production answers: the first request after a pause, then the median and p90 of a few more.
//
//   node scripts/measure-speed.mjs [base url] [--runs=10] [--pause=10] [--path=/x ...] [--cookie=ENV_NAME]
//
// The base URL defaults to https://usehourly.app. For each path it waits --pause seconds, sends one first request,
// then --runs more, one after another (never in parallel), and prints endpoint · status · first · median · p90 in ms.
// A time runs from sending the request to the end of the body. --cookie names an environment variable that holds the
// Cookie header for signed-in pages; its value is never printed. It sends nothing but GETs (see `get`). Exits 1 when a
// path failed (a network error or a status of 500 and up), 2 on bad input. Tested by measure-speed-journey.test.ts.

import { percentile } from "./perf/stats.mjs";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE = "https://usehourly.app";
const DEFAULT_PATHS = ["/api/health", "/auth/v2/login", "/"];
const USAGE =
  "Usage: node scripts/measure-speed.mjs [base url] [--runs=10] [--pause=10] [--path=/x ...] [--cookie=ENV_NAME]";

/** The one place a request is made: always GET, redirects not followed (a 307 to the login page stays visible). */
async function get(url, cookie) {
  const t0 = performance.now();
  const res = await fetch(url, { method: "GET", redirect: "manual", headers: cookie ? { cookie } : {} });
  await res.arrayBuffer();
  return { status: res.status, ms: performance.now() - t0 };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A short reason for a failed request (the error code), never the request's headers. */
const reason = (err) => String(err?.cause?.code ?? err?.name ?? "error").slice(0, 60);

/**
 * Times each path in turn and returns one row per path, in the order given:
 * { path, status, firstMs, medianMs, p90Ms, error }. The median and p90 cover the `runs` requests after the first.
 * A network error stops that path and is kept as a short message in `error`.
 */
export async function measureSpeed({ base, paths, runs, pauseMs, cookie = null }) {
  const rows = [];
  for (const path of paths) {
    await sleep(pauseMs);
    const row = { path, status: null, firstMs: null, medianMs: null, p90Ms: null, error: null };
    const times = [];
    try {
      const first = await get(base + path, cookie);
      row.status = first.status;
      row.firstMs = Math.round(first.ms);
      for (let i = 0; i < runs; i++) {
        const r = await get(base + path, cookie);
        row.status = r.status;
        times.push(r.ms);
      }
    } catch (err) {
      row.error = reason(err);
    }
    const round = (n) => (n === null ? null : Math.round(n));
    row.medianMs = round(percentile(times, 50));
    row.p90Ms = round(percentile(times, 90));
    rows.push(row);
  }
  return rows;
}

/** A row failed when its request did not finish or the server answered 500 and up. */
export const failed = (row) => row.error !== null || (row.status ?? 0) >= 500;

/** The table, one line per row: endpoint, status, first, median, p90. */
export function formatTable(rows) {
  const width = Math.max(16, ...rows.map((r) => r.path.length)) + 2;
  const ms = (n) => (n === null ? "-" : `${n} ms`).padStart(8);
  const lines = [
    ["endpoint".padEnd(width), "status".padStart(6), "first".padStart(8), "median".padStart(8), "p90".padStart(8)],
  ];
  for (const r of rows) {
    const status = r.error ? "error" : String(r.status);
    lines.push([r.path.padEnd(width), status.padStart(6), ms(r.firstMs), ms(r.medianMs), ms(r.p90Ms)]);
  }
  return lines.map((l) => l.join(" ").trimEnd()).join("\n");
}

/** Reads the command line; returns the options, or { problem } with what is wrong. */
export function parseArgs(args, env) {
  const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const base = (args.find((a) => /^https?:\/\//.test(a)) ?? DEFAULT_BASE).replace(/\/+$/, "");
  const runsText = value("runs") ?? "10";
  const pauseText = value("pause") ?? "10";
  const runs = Number(runsText);
  const pause = Number(pauseText);
  if (!/^\d+$/.test(runsText) || runs < 1 || runs > 50)
    return { problem: "--runs must be a whole number from 1 to 50." };
  if (pauseText.trim() === "" || !Number.isFinite(pause) || pause < 0 || pause > 120)
    return { problem: "--pause must be a number of seconds from 0 to 120." };
  const extra = args.filter((a) => a.startsWith("--path=")).map((a) => a.slice("--path=".length));
  if (extra.some((p) => !p.startsWith("/"))) return { problem: "--path must start with /." };
  const cookieVar = value("cookie") ?? null;
  const cookie = cookieVar ? env[cookieVar] : null;
  if (cookieVar && !cookie) return { problem: `The environment variable ${cookieVar} is empty or not set.` };
  return { base, runs, pauseMs: pause * 1000, paths: [...DEFAULT_PATHS, ...extra], cookie, cookieVar };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parseArgs(process.argv.slice(2), process.env);
  if (opts.problem) {
    console.error(`${opts.problem}\n${USAGE}`);
    process.exit(2);
  }
  const signedIn = opts.cookieVar ? `, signed in (cookie from ${opts.cookieVar})` : "";
  console.log(`${opts.base}  ${opts.runs} runs, ${opts.pauseMs / 1000} s pause${signedIn}\n`);
  const rows = await measureSpeed(opts);
  console.log(formatTable(rows));
  const bad = rows.filter(failed);
  for (const r of bad) console.error(`${r.path}: ${r.error ?? `status ${r.status}`}`);
  process.exit(bad.length ? 1 : 0);
}
