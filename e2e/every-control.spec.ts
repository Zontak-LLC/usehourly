import { expect, type Page, test } from "@playwright/test";

/**
 * "Does every control do something?" Opens each page with sample data, then clicks every button, tab and radio on it
 * (one at a time, on a fresh page) and fails if a click does nothing: no change on the page, no new address, no request,
 * no download, no new tab. That is how a button that was left unwired (for example "Edit day" after a rewrite) is caught
 * the day it breaks. It also checks that every link on those pages leads somewhere that works.
 *
 * It is slow (a few minutes), so it runs with the rest of the browser tests nightly and before a release:
 *   npm run e2e:sweep           (everything)
 *   SWEEP_PAGES=week npx playwright test e2e/every-control.spec.ts --project=desktop   (pages whose path contains "week")
 * A control that really has no visible effect is listed in QUIET below with the reason, never silently ignored.
 */
const PAGES = [
  "/dashboard/today",
  "/dashboard/week?date=2026-10-14",
  "/dashboard/month",
  "/dashboard/invoices",
  "/dashboard/invoices/new",
  "/dashboard/clients",
  "/dashboard/report",
  "/dashboard/account",
  "/dashboard/account#invoices",
  "/dashboard/account#data",
  "/dashboard/account#ai",
  "/dashboard/team",
  "/help",
  "/help/faq",
  "/help/rounding",
].filter((p) => !process.env.SWEEP_PAGES || p.includes(process.env.SWEEP_PAGES));

/** Never clicked: they end the session or the account. Everything else is clicked, destructive ones included (the data is throwaway). */
const NEVER = /log out|sign out|delete (my )?account|create my account|try the demo/i;
/** Controls that legitimately show nothing when clicked on a fresh page. Each needs a reason. */
const QUIET: { page: RegExp; name: RegExp; why: string }[] = [
  { page: /invoices\/new/, name: /^Cancel$/, why: "goes back to the list: covered as a link-style change of address" },
];

const CONTROLS = "button:visible, [role=tab]:visible, [role=radio]:visible, summary:visible";

async function openFresh(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("h1").first()).toBeVisible();
  await page.waitForTimeout(1300); // let the page's script finish starting: an early click would count as dead
}

async function describe(page: Page, index: number) {
  return page
    .locator(CONTROLS)
    .nth(index)
    .evaluate((el) => ({
      name: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || el.tagName)
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 60),
      disabled: (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true",
      inShadow: el.getRootNode() instanceof ShadowRoot, // Next's development badge
      selected: el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-checked") === "true",
    }));
}

test.describe("every control does something", () => {
  test.setTimeout(30 * 60_000);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: /try the demo|sample data/i })
      .first()
      .click();
    await expect(page).toHaveURL(/dashboard/);
  });

  test("buttons, tabs and radios", async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop", "the controls are the same on a phone; one pass is enough");
    const dead: string[] = [];
    const notClickable: string[] = [];
    let downloads = 0;
    let popups = 0;
    let pickers = 0;
    page.on("filechooser", () => pickers++); // "Add a logo" opens the computer's file picker, which the page cannot see
    page.on("download", () => downloads++);
    context.on("page", () => popups++);

    for (const path of PAGES) {
      await openFresh(page, path);
      const count = await page.locator(CONTROLS).count();
      for (let i = 0; i < count; i++) {
        await openFresh(page, path);
        if ((await page.locator(CONTROLS).count()) <= i) continue;
        const meta = await describe(page, i);
        if (meta.disabled || meta.inShadow || meta.selected || NEVER.test(meta.name)) continue; // a selected tab or radio is already what a click would pick
        const quiet = QUIET.find((q) => q.page.test(path) && q.name.test(meta.name));
        const control = page.locator(CONTROLS).nth(i);
        await control.scrollIntoViewIfNeeded().catch(() => undefined);
        await page.waitForTimeout(250);
        // Count changes ELSEWHERE on the page: the clicked control changing itself (its label, aria-expanded) does not
        // prove it did its job. A button that only flips its own state and opens nothing is exactly the bug to catch.
        await control.evaluate((el) => el.setAttribute("data-sweep-target", ""));
        await page.evaluate(() => {
          const w = window as unknown as { __changes: number };
          w.__changes = 0;
          new MutationObserver((records) => {
            const target = document.querySelector("[data-sweep-target]");
            for (const r of records) {
              if (target && (target === r.target || target.contains(r.target))) continue;
              if (r.type === "attributes" && r.attributeName === "data-sweep-target") continue;
              w.__changes++;
            }
          }).observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
          });
        });
        const before = { url: page.url(), downloads, popups, pickers };
        let requests = 0;
        const onRequest = () => requests++;
        page.on("request", onRequest);
        try {
          await control.click({ timeout: 5000 });
        } catch (err) {
          page.off("request", onRequest);
          notClickable.push(`${path}  "${meta.name}": ${(err as Error).message.split("\n")[0]}`);
          continue;
        }
        let changed = false;
        for (let wait = 0; wait < 8 && !changed; wait++) {
          await page.waitForTimeout(150);
          const n = await page
            .evaluate(() => (window as unknown as { __changes?: number }).__changes ?? 1)
            .catch(() => 1);
          changed =
            n > 0 ||
            page.url() !== before.url ||
            requests > 0 ||
            downloads > before.downloads ||
            popups > before.popups ||
            pickers > before.pickers;
        }
        page.off("request", onRequest);
        if (!changed && !quiet) dead.push(`${path}  "${meta.name}"`);
        await page.keyboard.press("Escape").catch(() => undefined);
      }
    }
    expect(notClickable, "controls that cannot be clicked").toEqual([]);
    expect(dead, "controls that do nothing when clicked").toEqual([]);
  });

  test("every link on these pages leads somewhere that works", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "the links are the same on a phone");
    const broken: string[] = [];
    const seen = new Set<string>();
    for (const path of PAGES) {
      await openFresh(page, path);
      const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
      for (const href of hrefs) {
        const url = new URL(href);
        if (url.origin !== new URL(page.url()).origin || seen.has(url.pathname + url.search)) continue;
        if (/\/api\/|signout|\/team\/join\/|\/stop-emails/.test(url.pathname)) continue;
        seen.add(url.pathname + url.search);
        const res = await page.request.get(href);
        if (res.status() >= 400 || /\/auth\/v2\/login/.test(res.url()))
          broken.push(`${path} -> ${url.pathname}${url.search} (${res.status()})`);
      }
    }
    expect(seen.size).toBeGreaterThan(PAGES.length > 6 ? 10 : 3);
    expect(broken, "links that are broken").toEqual([]);
  });
});
