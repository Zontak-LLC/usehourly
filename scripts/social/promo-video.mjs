// Records the promo video (Google Play listing, YouTube, the home page later) from the REAL app with the sample-data
// demo, in the light theme:
//   node scripts/social/promo-video.mjs [http://localhost:3042]
// Output: public/landing/promo/usehourly-promo-1080p.mp4 (1920x1080, H.264, yuv420p, 30 fps, faststart, silent) and
// public/landing/promo/usehourly-promo-poster.jpg (the title card).
//
// Needs: a running app on its own port and its own local database. Use a production build so the Next.js dev badge
// never shows, and switch the robot check off for the run (the demo button cannot pass it in automation):
//   NEXT_DIST_DIR=.next-promo npx next build
//   E2E_SERVE=1 E2E_PERSIST=.wrangler/state-promo NEXT_DIST_DIR=.next-promo TURNSTILE_SITE_KEY= TURNSTILE_SECRET_KEY= \
//     npx next start -p 3042
// (apply the migrations first: npx wrangler d1 migrations apply DB --local --persist-to .wrangler/state-promo)
// Also needs Playwright and ffmpeg (FFMPEG=/path/to/ffmpeg to choose one). Every run makes a new demo account.
//
// How it works: each scene is real clicks and typing, recorded with the browser's screencast (sharper than Playwright's
// own video, which is a low-bitrate WebM); a drawn pointer shows where the clicks land. ffmpeg then turns each scene's
// frames into a clip at a steady 30 fps, burns in its one-line caption (a pill drawn by the browser) and crossfades the
// clips. Title and end cards are pages drawn by the browser too, in the app's own colours and the Hex Clock mark.

import { chromium } from "@playwright/test";

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3042";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const root = resolve(import.meta.dirname, "../..");
const OUT_DIR = resolve(root, "public/landing/promo");
const WORK = "/tmp/uh-promo";
const W = 1280;
const H = 720;
const SCALE = 1.5; // 1280x720 at 1.5x = 1920x1080 pixels
const FPS = 30;
const FADE = 0.4; // crossfade between scenes, seconds

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// The Thursday of the current week (or last week when today is before Thursday): a weekday with sample entries.
const thursday = new Date();
thursday.setDate(thursday.getDate() - ((thursday.getDay() + 3) % 7));

// The colours and the mark, kept in step with src/app/globals.css (:root) and src/components/logo.tsx.
const C = { page: "#eef2f7", ink: "#141b29", muted: "#5b6678", blue: "#2563c9" };
const MARK = `<svg viewBox="0 0 100 100" fill="none" stroke-linecap="round">
  <path d="M50,5 L89,27.5 V72.5 L50,95 L11,72.5 V27.5 Z" stroke-width="6" stroke-linejoin="round" fill="${C.blue}" stroke="${C.blue}"/>
  <circle cx="50" cy="50" r="25" stroke-width="4.5" stroke="#fff"/>
  <path d="M50,50 L39,42 M50,50 L63,36" stroke-width="5" stroke="#fff"/>
  <circle cx="50" cy="50" r="3.4" fill="#fff"/></svg>`;
const FONT = `-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif`;

// Hides the demo banner, the sample account's "no links" line and any development overlay; draws a pointer that follows the (otherwise invisible) mouse.
const SETUP = `
addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.textContent = "[data-testid=demo-banner], nextjs-portal { display: none !important; }" +
    "#promo-pointer { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 26px;" +
    " height: 26px; margin: -3px 0 0 -4px; transition: transform 90ms ease-out; }" +
    "#promo-pointer.down { transform: scale(0.86); }";
  document.head.append(style);
  const p = document.createElement("div");
  p.id = "promo-pointer";
  p.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.6 L14.6 20.3 ' +
    'L11.7 13.7 L18 13.4 Z" fill="#141b29" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  p.style.translate = (window.__px ?? -60) + "px " + (window.__py ?? -60) + "px";
  document.body.append(p);
  addEventListener("mousemove", (e) => { window.__px = e.clientX; window.__py = e.clientY;
    p.style.translate = e.clientX + "px " + e.clientY + "px"; }, true);
  addEventListener("mousedown", () => p.classList.add("down"), true);
  addEventListener("mouseup", () => p.classList.remove("down"), true);
  // Sample accounts cannot make private invoice links, so the Send panel says so; a real account never sees this line.
  const quiet = () => { for (const el of document.querySelectorAll("p")) {
    if (el.textContent.startsWith("Create a free account to share")) el.parentElement.style.display = "none"; } };
  new MutationObserver(quiet).observe(document.body, { childList: true, subtree: true });
});`;

const ff = (args) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: SCALE,
  colorScheme: "light",
  reducedMotion: "no-preference",
});
const page = await context.newPage();
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
page.on("pageerror", (e) => problems.push(String(e)));
await page.addInitScript(SETUP);
let pointer = { x: W / 2, y: H + 40 };

/** Moves the pointer to the middle of a control in a smooth line, rests a moment, then clicks it. */
async function tap(locator, { rest = 260 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Nothing to click: ${locator}`);
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const steps = Math.max(12, Math.round(Math.hypot(to.x - pointer.x, to.y - pointer.y) / 22));
  await page.mouse.move(to.x, to.y, { steps });
  pointer = to;
  await wait(rest);
  await page.mouse.down();
  await wait(90);
  await page.mouse.up();
  await wait(60);
}

async function scrollTo(y, ms = 700) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "smooth" }), y);
  await wait(ms);
}

/** Records the screen while `act` runs; returns the scene's frames as [file, seconds] pairs. */
async function record(name, act) {
  const dir = join(WORK, name);
  mkdirSync(dir, { recursive: true });
  const cdp = await context.newCDPSession(page);
  const frames = [];
  let started = 0;
  cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
    const file = join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push([file, Date.now() / 1000]);
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined); // the session may close first
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: W * SCALE, maxHeight: H * SCALE });
  await wait(300);
  started = Date.now() / 1000;
  await act();
  await wait(200);
  const ended = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  await cdp.detach();
  if (frames.length === 0) throw new Error(`No frames for ${name}`);
  // Frames come only when the screen changes: each one lasts until the next, the last one until the end. The scene
  // starts with the frame on screen when `act` began.
  const first = Math.max(
    0,
    frames.findLastIndex(([, t]) => t <= started),
  );
  const kept = frames.slice(first);
  return kept.map(([file, t], i) => [file, Math.max(0.001, (kept[i + 1]?.[1] ?? ended) - Math.max(t, started))]);
}

/** Turns frames into a clip at a steady frame rate, 1920x1080. */
function clip(name, frames) {
  const list = join(WORK, `${name}.txt`);
  const lines = frames.flatMap(([file, d]) => [`file '${file}'`, `duration ${d.toFixed(4)}`]);
  lines.push(`file '${frames.at(-1)[0]}'`);
  writeFileSync(list, `${lines.join("\n")}\n`);
  const mp4 = join(WORK, `${name}-raw.mp4`);
  ff([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-vf",
    `scale=1920:1080:flags=lanczos:out_range=tv:out_color_matrix=bt709,fps=${FPS},format=yuv420p`,
    ...enc(),
    mp4,
  ]);
  return mp4;
}

const enc = () => [
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "18",
  "-pix_fmt",
  "yuv420p",
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-color_range",
  "tv",
  "-r",
  String(FPS),
];

/** A still page (title, end card or caption pill) drawn by the browser, saved as a PNG. */
async function still(file, html, { transparent = false } = {}) {
  const p = await context.newPage();
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: ${W}px; height: ${H}px; font-family: ${FONT}; color: ${C.ink};
      background: ${transparent ? "transparent" : C.page}; -webkit-font-smoothing: antialiased; }
  </style></head><body>${html}</body></html>`);
  await p.screenshot({ path: file, omitBackground: transparent });
  await p.close();
}

const card = (inner) => `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:22px;background:radial-gradient(ellipse 60% 55% at 50% 45%,
  color-mix(in oklab, ${C.blue} 13%, transparent), transparent 70%), ${C.page}">${inner}</div>`;

async function cardClip(name, html, seconds) {
  const png = join(WORK, `${name}.png`);
  await still(png, card(html));
  const mp4 = join(WORK, `${name}.mp4`);
  ff([
    "-loop",
    "1",
    "-t",
    String(seconds),
    "-i",
    png,
    "-vf",
    `scale=1920:1080:flags=lanczos:out_range=tv:out_color_matrix=bt709,format=yuv420p`,
    ...enc(),
    mp4,
  ]);
  return { mp4, seconds, png };
}

async function captioned(name, raw, text) {
  const png = join(WORK, `${name}-caption.png`);
  await still(
    png,
    `<div style="position:absolute;left:0;right:0;bottom:34px;display:flex;justify-content:center">
      <div style="padding:12px 26px;border-radius:999px;background:rgba(20,27,41,0.86);color:#fff;font-size:26px;
        font-weight:600;letter-spacing:-0.01em;box-shadow:0 6px 24px rgba(20,27,41,0.25)">${text}</div></div>`,
    { transparent: true },
  );
  const seconds = Number(
    execFileSync(FFMPEG.replace(/ffmpeg$/, "ffprobe"), [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      raw,
    ]).toString(),
  );
  const mp4 = join(WORK, `${name}.mp4`);
  ff([
    "-i",
    raw,
    "-loop",
    "1",
    "-i",
    png,
    "-filter_complex",
    `[1:v]scale=1920:1080,format=rgba,fade=in:st=0.35:d=0.35:alpha=1,fade=out:st=${(seconds - 0.6).toFixed(2)}:d=0.3:alpha=1[c];` +
      `[0:v][c]overlay=0:0:shortest=1,format=yuv420p[v]`,
    "-map",
    "[v]",
    ...enc(),
    mp4,
  ]);
  return { mp4, seconds };
}

// ---- The demo account -------------------------------------------------------------------------------------------
await page.goto(`${BASE}/`);
await page
  .getByRole("button", { name: /try the demo/i })
  .first()
  .click();
await page.waitForURL(/dashboard/);

async function open(path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  await wait(700);
  await page.mouse.move(pointer.x, pointer.y);
}

// ---- Scenes -----------------------------------------------------------------------------------------------------
const scenes = [];

scenes.push(
  await cardClip(
    "1-title",
    `<div style="width:132px;height:132px">${MARK}</div>
     <div style="font-size:76px;font-weight:700;letter-spacing:-0.03em;color:${C.blue}">UseHourly</div>
     <div style="font-size:34px;font-weight:500;color:${C.ink};letter-spacing:-0.01em">Log your day in seconds.</div>`,
    3,
  ),
);

await open("/dashboard/today");
pointer = { x: 900, y: 650 };
await page.mouse.move(pointer.x, pointer.y);
const today = await record("2-today", async () => {
  await wait(300);
  await tap(page.getByRole("button", { name: /1 hour/ }).first());
  await wait(150);
  await tap(page.getByRole("radio", { name: /Website redesign/ }));
  await tap(page.getByLabel("Description"), { rest: 150 });
  await page.getByLabel("Description").pressSequentially("Homepage hero polish", { delay: 55 });
  await wait(250);
  await tap(page.getByRole("button", { name: /^Log time/ }));
  await wait(800);
  await scrollTo(330, 800);
  await page.getByText("Homepage hero polish").first().waitFor();
  await wait(1000);
});
scenes.push(await captioned("2-today", clip("2-today", today), "Log time in two taps"));

await scrollTo(0, 400);
await page.evaluate(() => window.scrollTo(0, 0));
await wait(400);
const timer = await record("3-timer", async () => {
  await wait(250);
  await tap(page.getByRole("button", { name: "Start timer" }));
  await wait(2800);
  await tap(page.getByRole("button", { name: "Stop timer" }));
  await page.getByText(/Saved/).first().waitFor();
  // Off the small +/- buttons that appear under the pointer, so none of them shows a hover ring.
  await page.mouse.move(520, 300, { steps: 18 });
  pointer = { x: 520, y: 300 };
  await wait(1100);
});
scenes.push(await captioned("3-timer", clip("3-timer", timer), "A timer when you need one"));

await open(`/dashboard/week?date=${ymd(thursday)}`);
const week = await record("4-week", async () => {
  await wait(300);
  const tiles = page.getByRole("navigation", { name: "This week" }).getByRole("button");
  await tap(tiles.nth(1)); // Tuesday
  await wait(800);
  await tap(tiles.nth(3)); // Thursday
  await wait(700);
  await page.mouse.move(200, 470, { steps: 20 });
  pointer = { x: 200, y: 470 };
  await wait(1100);
});
scenes.push(await captioned("4-week", clip("4-week", week), "Your week at a glance"));

await open("/dashboard/invoices");
const invoices = await record("5-invoices", async () => {
  await wait(250);
  await tap(page.getByText("INV-2026-001").first());
  await wait(800);
  await tap(page.getByText("INV-2026-002").first());
  await wait(400);
  await tap(page.getByRole("button", { name: /^Send/ }).first());
  await wait(300);
  await scrollTo(300, 700);
  const to = page.getByLabel("To", { exact: true });
  await tap(to, { rest: 120 });
  await to.pressSequentially("accounts@fablelabs.example", { delay: 35 });
  await wait(1100);
});
scenes.push(await captioned("5-invoices", clip("5-invoices", invoices), "Send invoices from your own mail"));

await open("/dashboard/report");
const year = await record("6-year", async () => {
  await wait(300);
  await tap(page.getByText("Clients and projects", { exact: true }).first());
  await wait(900);
  await page.mouse.move(500, 440, { steps: 24 });
  pointer = { x: 500, y: 440 };
  await wait(1300);
});
scenes.push(await captioned("6-year", clip("6-year", year), "Your year, ready for taxes"));

scenes.push(
  await cardClip(
    "7-end",
    `<div style="width:96px;height:96px">${MARK}</div>
     <div style="font-size:46px;font-weight:700;letter-spacing:-0.02em">Free and open source. No ads.</div>
     <div style="font-size:40px;font-weight:600;color:${C.blue};letter-spacing:-0.01em">usehourly.app</div>`,
    3,
  ),
);
await browser.close();

// ---- Join the scenes with crossfades ----------------------------------------------------------------------------
const inputs = scenes.flatMap((s) => ["-i", s.mp4]);
const parts = [];
let label = "[0:v]";
let offset = 0;
for (let i = 1; i < scenes.length; i++) {
  offset += scenes[i - 1].seconds - FADE;
  const out = i === scenes.length - 1 ? "[v]" : `[x${i}]`;
  parts.push(`${label}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}${out}`);
  label = out;
}
const video = join(OUT_DIR, "usehourly-promo-1080p.mp4");
ff([
  ...inputs,
  "-filter_complex",
  `${parts.join(";")};[v]format=yuv420p[o]`,
  "-map",
  "[o]",
  ...enc(),
  "-an",
  "-movflags",
  "+faststart",
  video,
]);
ff([
  "-i",
  scenes[0].png,
  "-vf",
  "scale=1920:1080:flags=lanczos",
  "-q:v",
  "3",
  join(OUT_DIR, "usehourly-promo-poster.jpg"),
]);

console.log(`video ${video}`);
let at = 0;
for (const s of scenes) {
  console.log(`${s.mp4.split("/").at(-1)}  starts ${at.toFixed(1)} s  lasts ${s.seconds.toFixed(1)} s`);
  at += s.seconds - FADE;
}
if (problems.length) console.log(`browser errors:\n${problems.join("\n")}`);
