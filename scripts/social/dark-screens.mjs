// Retakes the desktop pictures of the app in DARK mode (the visitor's system theme is dark, so the app is dark):
//   node scripts/social/dark-screens.mjs [http://localhost:3028] [out dir] [width]
// Pictures: <out>/N-name.webp (default out: public/landing/tour-dark, default width 1000). Needs the app running and cwebp.
// Desktop full-page pictures (1440 wide) -> public/landing/tour/N-name.webp (the landing page's product tour)
// Phone pictures (360x640 at 3x = 1080x1920) -> android/store/screenshots/N-name.png (Play Store) and
//   public/landing/tour-phone/N-name.webp (540 wide, the tour on a phone)
// Needs the app running (npm run dev), Playwright, and cwebp (brew install webp). Run it after changing how a screen looks.

import { chromium } from "@playwright/test";

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3028";
const OUT = process.argv[3] ?? "public/landing/tour-dark";
const WIDTH = Number(process.argv[4] ?? 1000);
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
  viewport: { width: 1440, height: 2600 },
  deviceScaleFactor: 1,
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
  const h = await page.evaluate(() => {
    const card = document.querySelector("h1")?.closest("div[class*='overflow-hidden']");
    return Math.min(2600, Math.ceil((card ? card.getBoundingClientRect().bottom + window.scrollY : 1200) + 40));
  });
  const png = `/tmp/uh-screens/dark-${name}.png`;
  await page.screenshot({
    path: png,
    clip: { x: 0, y: 0, width: 1440, height: h },
    animations: "disabled",
    caret: "initial",
  });
  cwebp(png, resolve(root, OUT, `${name}.webp`), 80, WIDTH);
  console.log("dark", name, h);
}
await browser.close();
