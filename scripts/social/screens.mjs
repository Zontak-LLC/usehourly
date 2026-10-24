// Retakes every promotional picture of the app from the sample-data demo, in the default Neutral light theme:
//   node scripts/social/screens.mjs [http://localhost:3028]
// Desktop pictures (a 1120x1008 window at 2x, saved 1400x1260) -> public/landing/tour/N-name.webp (the home page's
//   screens deck; the dark set comes from dark-screens.mjs with the same window)
// Phone pictures (360x640 at 3x = 1080x1920) -> android/store/screenshots/N-name.png (Play Store) and
//   public/landing/tour-phone/N-name.webp (540 wide, the tour on a phone)
// Needs the app running (npm run dev), Playwright, and cwebp (brew install webp). Run it after changing how a screen looks.

import { chromium } from "@playwright/test";

import { fillToday } from "./fill-today.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3028";
const root = resolve(import.meta.dirname, "../..");
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// The Wednesday of last week: a full past week of sample data, so the pictures are busy.
const d = new Date();
d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 5);
const thu = ymd(d);
const SCREENS = [
  ["1-today", "/dashboard/today"], // today, filled by fillToday (issue 252)
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
for (const dir of ["public/landing/tour", "public/landing/tour-phone", "android/store/screenshots"])
  mkdirSync(resolve(root, dir), { recursive: true });
const browser = await chromium.launch();

async function demo(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await page.waitForURL(/dashboard/);
  await fillToday(page, BASE);
  return page;
}

// Desktop: a tight window, 10:9 (issue 221: a 1440-wide full page left the app small, with an empty lower third).
// 1120 wide makes the page card (max 1024) fill the window; 2x pixels, saved 1400 wide, so the words stay sharp.
{
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 1008 }, deviceScaleFactor: 2 });
  const page = await demo(ctx);
  for (const [name, url] of SCREENS) {
    await page.goto(`${BASE}${url}`);
    await page.addStyleTag({ content: HIDE });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    const png = `/tmp/uh-screens/${name}.png`;
    await page.screenshot({ path: png, animations: "disabled", caret: "initial" });
    cwebp(png, resolve(root, `public/landing/tour/${name}.webp`), 80, 1400);
    console.log("desktop", name);
  }
  await ctx.close();
}

// Phone: what a phone shows without scrolling (the bottom bar included).
{
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await demo(ctx);
  for (const [name, url] of SCREENS) {
    await page.goto(`${BASE}${url}`);
    await page.addStyleTag({ content: HIDE });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    const png = resolve(root, `android/store/screenshots/${name}.png`);
    await page.screenshot({ path: png, animations: "disabled", caret: "initial" });
    cwebp(png, resolve(root, `public/landing/tour-phone/${name}.webp`), 82, 540);
    console.log("phone", name);
  }
  await ctx.close();
}
await browser.close();
