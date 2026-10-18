// A small, dependency-free load check for the public pages and the health endpoint.
//
//   node scripts/load-check.mjs http://localhost:3029 [--seconds=10] [--concurrency=5]
//
// It sends GET requests round-robin to a fixed list of public paths and prints, per path, how many answered, how many
// failed (a network error or a status of 500 and up) and the 50th / 95th percentile and worst latency. It exits 1 when
// anything failed or a p95 is over --max-p95 (default 1500 ms). It never signs in and sends nothing but GETs.
// It refuses to run against the production site unless --i-own-this-site is passed.
const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? "").replace(/\/+$/, "");
const opt = (name, fallback) => Number(args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
const seconds = opt("seconds", 10);
const concurrency = opt("concurrency", 5);
const maxP95 = opt("max-p95", 1500);

if (!base) {
  console.error("Usage: node scripts/load-check.mjs <base url> [--seconds=10] [--concurrency=5] [--max-p95=1500]");
  process.exit(2);
}
if (/(^|\.)usehourly\.app$/.test(new URL(base).hostname) && !args.includes("--i-own-this-site")) {
  console.error("Refusing to load-test production. Run it against a local or preview copy, or pass --i-own-this-site.");
  process.exit(2);
}

const paths = ["/", "/auth/v2/login", "/auth/v2/register", "/privacy", "/terms", "/api/health"];
const stats = new Map(paths.map((p) => [p, { ok: 0, failed: 0, times: [] }]));
const stopAt = Date.now() + seconds * 1000;
let next = 0;

async function worker() {
  while (Date.now() < stopAt) {
    const path = paths[next++ % paths.length];
    const s = stats.get(path);
    const t0 = performance.now();
    try {
      const res = await fetch(base + path, { redirect: "manual" });
      await res.arrayBuffer();
      s.times.push(performance.now() - t0);
      if (res.status >= 500) s.failed++;
      else s.ok++;
    } catch {
      s.failed++;
    }
  }
}

const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;
await Promise.all(Array.from({ length: concurrency }, worker));

let bad = false;
console.log(`${base}  ${seconds}s  ${concurrency} at a time\n`);
console.log(
  "path".padEnd(22),
  "ok".padStart(6),
  "failed".padStart(7),
  "p50".padStart(8),
  "p95".padStart(8),
  "max".padStart(8),
);
for (const [path, s] of stats) {
  const t = [...s.times].sort((a, b) => a - b);
  const p95 = pct(t, 95);
  if (s.failed > 0 || p95 > maxP95) bad = true;
  const ms = (n) => `${Math.round(n)} ms`.padStart(8);
  console.log(
    path.padEnd(22),
    String(s.ok).padStart(6),
    String(s.failed).padStart(7),
    ms(pct(t, 50)),
    ms(p95),
    ms(t.at(-1) ?? 0),
  );
}
console.log(bad ? "\nFAILED: errors, or a p95 over the limit." : "\nOK");
process.exit(bad ? 1 : 0);
