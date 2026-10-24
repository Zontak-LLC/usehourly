// Retakes the desktop pictures of the app in DARK mode (the visitor's system theme is dark, so the app is dark):
//   node scripts/social/dark-screens.mjs [http://localhost:3028] [out dir] [width]
// Pictures: <out>/N-name.webp (default out: public/landing/tour-dark, default width 1400), the same 1120x1008 window at
// 2x as the light set from screens.mjs, so both decks have one shape (10:9).
// Needs the app running (npm run dev), Playwright, and cwebp (brew install webp). Run it after changing how a screen looks.

import { chromium } from "@playwright/test";

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3028";
const OUT = process.argv[3] ?? "public/landing/tour-dark";
const WIDTH = Number(process.argv[4] ?? 1400);
const root = resolve(import.meta.dirname, "../..");
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// The Thursday of last week: a full past week of sample data, so the pictures are busy.
const d = new Date();
d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 5);
const thu = ymd(d);
const SCREENS = [
  ["1-today", `/dashboard/today?date=${thu}`],
  ["2-week", `/dashboard/week?date=${thu}`],
  ["3-month", "/dashboard/month"],
  ["4-invoices", "/dashboard/invoices"],
  ["5-clients", "/dashboard/clients"],
  ["6-year", "/dashboard/report"],
];
const HIDE =
  "nextjs-portal { display: none !important; } [role=status]:has(a[href*='#claim']) { display: none !important; }";
const cwebp = (src, out, q = 80, width) =>
  execFileSync("cwebp", ["-quiet", "-q", String(q), ...(width ? ["-resize", String(width), "0"] : []), src, "-o", out]);

mkdirSync("/tmp/uh-screens", { recursive: true });
mkdirSync(resolve(root, OUT), { recursive: true });
const browser = await chromium.launch();

const ctx = await browser.newContext({
  viewport: { width: 1120, height: 1008 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
// The app reads its theme from this cookie (the gear menu sets it), not from the browser setting.
await ctx.addCookies([{ name: "theme_mode", value: "dark", url: BASE }]);
const page = await ctx.newPage();
await page.goto(`${BASE}/`);
await page
  .getByRole("button", { name: /try the demo/i })
  .first()
  .click();
await page.waitForURL(/dashboard/);
for (const [name, url] of SCREENS) {
  await page.goto(`${BASE}${url}`);
  await page.addStyleTag({ content: HIDE });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  const png = `/tmp/uh-screens/dark-${name}.png`;
  await page.screenshot({ path: png, animations: "disabled", caret: "initial" });
  cwebp(png, resolve(root, OUT, `${name}.webp`), 80, WIDTH);
  console.log("dark", name);
}
await browser.close();
