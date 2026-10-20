// Renders the share images and the assistant demo video from the two HTML files next to it.
//   node scripts/social/render.mjs
// Writes src/app/opengraph-image.png and src/app/twitter-image.png (2400x1260), public/landing/assistant-demo.mp4 and
// a poster. Needs Playwright (already a dev dependency) and ffmpeg on the PATH.

import { chromium } from "@playwright/test";

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const here = resolve(import.meta.dirname);
const root = resolve(here, "../..");
const browser = await chromium.launch();

// 1. Share image: 1200x630 page at 2x = 2400x1260.
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  await page.goto(`file://${here}/share.html`);
  await page.screenshot({ path: join(root, "src/app/opengraph-image.png") });
  copyFileSync(join(root, "src/app/opengraph-image.png"), join(root, "src/app/twitter-image.png"));
  await page.close();
}

// 2. Demo video: record the animated page for its length, then cut it to H.264 for the web.
{
  const dir = mkdtempSync(join(tmpdir(), "uh-demo-"));
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir, size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();
  await page.goto(`file://${here}/demo.html`);
  await page.waitForTimeout(15500);
  await ctx.close();
  const webm = join(
    dir,
    readdirSync(dir).find((f) => f.endsWith(".webm")),
  );
  mkdirSync(join(root, "public/landing"), { recursive: true });
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      webm,
      "-t",
      "15",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "26",
      "-preset",
      "slow",
      "-movflags",
      "+faststart",
      "-an",
      join(root, "public/landing/assistant-demo.mp4"),
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      "14.2",
      "-i",
      join(root, "public/landing/assistant-demo.mp4"),
      "-frames:v",
      "1",
      join(dir, "poster.png"),
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "cwebp",
    ["-q", "82", join(dir, "poster.png"), "-o", join(root, "public/landing/assistant-demo-poster.webp")],
    { stdio: "ignore" },
  );
  rmSync(dir, { recursive: true, force: true });
}
await browser.close();
console.log("done");
