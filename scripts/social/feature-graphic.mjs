// Draws the Play Store feature graphic (1024x500) from the current logo and the Play phone screenshots:
//   node scripts/social/feature-graphic.mjs
// Run `node scripts/social/screens.mjs` first so the phones show the current app. Writes android/store/feature-graphic.png.

import { chromium } from "@playwright/test";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const shot = (name) =>
  `data:image/png;base64,${readFileSync(resolve(root, "android/store/screenshots", name)).toString("base64")}`;
// The mark: the same geometry as src/app/icon.svg.
const MARK = `<svg viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#f5a524"/><circle cx="32" cy="32" r="22" fill="none" stroke="#111" stroke-width="5"/><path d="M32 32L21.6 26M32 32L45.9 24" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="32" r="4" fill="#111"/></svg>`;

const html = `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1024px; height: 500px; overflow: hidden; position: relative; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    background: linear-gradient(100deg, #fbf6ea 0%, #fbf6ea 55%, #fbf4e3 100%); color: #2a1f14; }
  .copy { position: absolute; left: 64px; top: 150px; width: 460px; }
  .brand { display: flex; align-items: center; gap: 22px; }
  .brand svg { width: 72px; height: 72px; }
  .brand span { font-size: 56px; font-weight: 750; letter-spacing: -1.5px; }
  h1 { margin-top: 22px; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; }
  p { margin-top: 10px; font-size: 20px; line-height: 1.4; color: #6b5a49; }
  .phone { position: absolute; width: 260px; height: 520px; border-radius: 34px; border: 7px solid #17181c; overflow: hidden; background: #fff;
    box-shadow: 0 18px 40px rgba(60,40,10,.28); }
  .phone img { width: 100%; display: block; }
  .p1 { left: 598px; top: 44px; transform: rotate(5deg); }
  .p2 { left: 786px; top: 92px; transform: rotate(5deg); }
</style>
<div class="copy"><div class="brand">${MARK}<span>UseHourly</span></div>
<h1>Log your day in seconds.</h1><p>Free time tracking, timesheets and invoices for freelancers.</p></div>
<div class="phone p1"><img src="${shot("2-week.png")}"></div><div class="phone p2"><img src="${shot("4-invoices.png")}"></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: resolve(root, "android/store/feature-graphic.png") });
await browser.close();
console.log("feature graphic written");
