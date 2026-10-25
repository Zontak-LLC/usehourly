import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import { DEFAULT_PAGES, pngWidth, readSettings, SIZES, shotFile, THEMES } from "../scripts/shots.mjs";
import { setTheme, signUpReady } from "./helpers";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Not part of a normal run. Photographs the pages Day Shift's visual QA asks for (issue 366), signed in as a new e2e
 * test account, at 1440 and 390 wide, light and dark. Run it through the wrapper, which checks the settings first:
 *   DAYSHIFT_SHOTS_DIR=/tmp/shots DAYSHIFT_SHOTS_PAGES=/dashboard/week npm run shots
 * The page list, file names and PNG check live in scripts/shots.mjs.
 */
test.skip(!process.env.SHOTS, "only through npm run shots");
test.use({ deviceScaleFactor: 1, colorScheme: "light" });

const settings = readSettings(process.env, process.cwd());

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }, testInfo) => {
  if (settings.problem) throw new Error(settings.problem);
  context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, deviceScaleFactor: 1 });
  page = await context.newPage();
  await signUpReady(page);
});

test.afterAll(() => context?.close());

/** Why the route did not load as a real signed-in page, or null when it did. */
async function pageProblem(route: string): Promise<string | null> {
  const response = await page.goto(route);
  const status = response?.status() ?? 0;
  if (status === 404) return `${route} did not load: page not found.`;
  if (status >= 400) return `${route} did not load: the server answered ${status}.`;
  if (new URL(page.url()).pathname === "/auth/v2/login") return `${route} did not load: not signed in.`;
  const heading = page.locator("h1").first();
  const shown = await heading
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return `${route} did not load: no page title appeared within 15 seconds.`;
  if ((await heading.innerText()).trim() === "Page not found.") return `${route} did not load: page not found.`;
  return null;
}

/**
 * The luminance (0 to 1) of the page's background: the first colour that is not transparent, from <main> up to <html>.
 * The colour goes through a canvas, so any CSS colour form (rgb, oklch, lab) reads the same way.
 */
const backgroundLuminance = () =>
  page.evaluate(() => {
    let el: Element | null = document.querySelector("main") ?? document.body;
    let colour = "rgba(0, 0, 0, 0)";
    for (; el; el = el.parentElement) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(bg)) {
        colour = bg;
        break;
      }
    }
    const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3), (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  });

// With bad settings the tests are still listed (shown as skipped in a normal run); beforeAll stops a real run.
for (const route of settings.pages ?? DEFAULT_PAGES) {
  test(`photograph ${route}`, async () => {
    test.setTimeout(5 * 60_000);
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      const problem = await pageProblem(route);
      if (problem) throw new Error(problem);
      await page.addStyleTag({
        content:
          "nextjs-portal { display: none !important; } *, *::before, *::after { transition: none !important; animation: none !important; }",
      });
      await page.waitForLoadState("networkidle");
      const shots: { file: string; png: Buffer; luminance: number }[] = [];
      for (const theme of THEMES) {
        await setTheme(page, theme);
        const file = shotFile(route, width, theme);
        const png = await page.screenshot({ fullPage: true, caret: "initial", animations: "disabled" });
        expect(pngWidth(png), `${file} is ${width} wide`).toBe(width);
        shots.push({ file, png, luminance: await backgroundLuminance() });
      }
      const [light, dark] = shots;
      expect(dark.luminance, `${dark.file} is darker than ${light.file}`).toBeLessThan(light.luminance);
      for (const s of shots) writeFileSync(join(settings.dir as string, s.file), s.png);
    }
  });
}
