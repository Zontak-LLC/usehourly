// Quick look at the staging copy after a deploy: the health check, the banner, no indexing, and the public pages.
//   npm run staging:smoke            (uses https://staging.usehourly.app; STAGING_URL overrides)
// Exits 1 on the first problem. The browser suite can also be pointed at staging with E2E_BASE_URL.
const base = (process.env.STAGING_URL ?? "https://staging.usehourly.app").replace(/\/+$/, "");
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed = true;
};

const health = await fetch(`${base}/api/health`).catch(() => null);
check(health?.status === 200 && (await health.json()).ok === true, "/api/health answers ok");

const home = await fetch(base).catch(() => null);
const html = home ? await home.text() : "";
check(home?.status === 200, "the landing page loads");
check(/Staging copy/.test(html), "the staging banner is shown");
check(/noindex/.test(home?.headers.get("x-robots-tag") ?? ""), "pages carry X-Robots-Tag: noindex");

for (const path of ["/auth/v2/login", "/auth/v2/register", "/help", "/privacy"]) {
  const res = await fetch(base + path, { redirect: "manual" }).catch(() => null);
  check(res?.status === 200, `${path} loads`);
}
const dash = await fetch(`${base}/dashboard/today`, { redirect: "manual" }).catch(() => null);
check(dash && dash.status >= 300 && dash.status < 400, "the dashboard sends signed-out visitors to log in");

process.exit(failed ? 1 : 0);
