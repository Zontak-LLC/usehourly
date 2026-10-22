// Retakes the PHONE pictures of the app for the home page's screens deck on a phone:
//   node scripts/social/dark-phone-screens.mjs [http://localhost:3028] [dark|light]
// 360x640 at 3x, resized to 540 wide -> public/landing/tour-phone-dark/N-name.webp (dark, the default) or
// public/landing/tour-phone/N-name.webp (light)
// Needs the app running (npm run dev), Playwright, and cwebp (brew install webp).

import { chromium } from "@playwright/test";

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3028";
const root = resolve(import.meta.dirname, "../..");
const MODE = process.argv[3] === "light" ? "light" : "dark";
const OUTDIR = MODE === "light" ? "public/landing/tour-phone" : "public/landing/tour-phone-dark";
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// The Wednesday of last week: a full past week of sample data, so the pictures are busy.
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
mkdirSync(resolve(root, OUTDIR), { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  colorScheme: MODE,
});
// The app reads its theme from this cookie (the gear menu sets it), not from the browser setting.
await ctx.addCookies([{ name: "theme_mode", value: MODE, url: BASE }]);
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
  const png = `/tmp/uh-screens/${MODE}-phone-${name}.png`;
  await page.screenshot({ path: png, animations: "disabled", caret: "initial" });
  cwebp(png, resolve(root, `${OUTDIR}/${name}.webp`), 82, 540);
  console.log(MODE, "phone", name);
}
await browser.close();
