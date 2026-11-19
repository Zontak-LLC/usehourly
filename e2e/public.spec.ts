import { test as plainTest } from "@playwright/test";

import { landingHeaders, landingPolicy } from "../scripts/landing-static-headers.mjs";
import { watchCspViolations } from "./csp-violations";
import { expect, holdRoute, signUpByApi, startDemo, test } from "./helpers";

/** What a stranger can reach without signing in: it must load cleanly, read well on a phone, and not leak or break. */
const PUBLIC_PAGES: [string, string][] = [
  ["/", "landing"],
  ["/auth/v2/login", "log in"],
  ["/auth/v2/register", "sign up"],
  ["/privacy", "privacy"],
  ["/terms", "terms"],
  ["/tools/hours-calculator", "hours calculator"],
  ["/help", "help"],
];

test.describe("public pages", () => {
  for (const [path, name] of PUBLIC_PAGES) {
    test(`${name} loads cleanly`, async ({ page, shot, audit, a11y }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("main, body").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      await shot(name);
      await audit(name);
      await a11y(name);
    });
  }

  // The landing page is a static file now (issue 424): no proxy runs on /, so the page itself sends a signed-in visitor
  // on after it paints (SignedInRedirect asks /api/auth/session).
  test("signed out, the landing page shows its headline and stays on /", async ({ page }) => {
    const sessionAsked = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/auth/session");
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Intuitive time tracking. Free." })).toBeVisible();
    await sessionAsked;
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Intuitive time tracking. Free." })).toBeVisible();
  });

  // The static page paints before its script runs. A tap on Try the demo in that gap did nothing, so a visitor (and a
  // test on a busy machine) stayed on /. The button now says it is unavailable until then.
  test("Try the demo is marked unavailable until the page's script has run, then starts the demo", async ({ page }) => {
    // Scripts only: the stylesheets sit in the same folder, and holding them would hold the whole page back.
    const scripts = await holdRoute(page, "**/_next/static/chunks/*.js");
    // Not "domcontentloaded": that waits for a held script. The page's HTML is all there once a script request arrives.
    await page.goto("/", { waitUntil: "commit" });
    await scripts.arrived;
    const button = page.getByRole("button", { name: /try the demo/i }).first();
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(button).toBeDisabled();
    scripts.release();
    await expect(button).toBeEnabled();
    await expect(button).not.toHaveAttribute("aria-disabled");
    await button.click();
    await expect(page).toHaveURL(/\/dashboard\/today$/);
  });

  test("signed in, the landing page ends on Today", async ({ page }) => {
    await startDemo(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard\/today$/);
  });

  // Local browser tests run `next start`, which never reads `_headers`. So the build's real landing page is served here
  // under the exact policy scripts/landing-static.mjs writes for it: its hashes must cover Next.js's own inline scripts.
  test("the built landing page runs under its by-hash policy with no violation", async ({ page, request }) => {
    const html = await (await request.get("/")).text();
    const csp = landingPolicy(landingHeaders({ html, isProd: false, upgradeToHttps: false, isStaging: false }));
    expect(csp).toContain("'sha256-");
    expect(csp).not.toContain("'nonce-");
    const violations = await watchCspViolations(page);
    await page.route(
      (url) => url.pathname === "/",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          headers: { "content-security-policy": csp },
          body: html,
        }),
    );
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Intuitive time tracking. Free." })).toBeVisible();
    // the theme boot script (an inline script) ran: it sets the colour scheme on <html>
    await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toMatch(/^(light|dark)$/);
    await page.waitForLoadState("networkidle");
    expect(await violations()).toEqual([]);
  });

  test("other pages keep the per-request nonce policy", async ({ request }) => {
    const res = await request.get("/help");
    expect(res.headers()["content-security-policy"]).toContain("'nonce-");
  });

  // The plain Playwright test: the shared page check fails a test on any console error, and the browser logs this
  // page's own 404 answer as one ("the server responded with a status of 404"), which is the point of the test.
  plainTest(
    "an unknown address shows the 404 page with a nonce policy, and its link works (the page hydrated)",
    async ({ page }) => {
      await signUpByApi(page); // signed out, the proxy sends an unknown address to log in instead
      const violations = await watchCspViolations(page);
      const res = await page.goto("/no-such-page");
      expect(res?.status()).toBe(404);
      expect(res?.headers()["content-security-policy"]).toContain("'nonce-");
      await expect(page.getByRole("heading", { name: "Page not found." })).toBeVisible();
      expect(await violations()).toEqual([]);
      const link = page.getByRole("link", { name: "Go to Today" });
      // React attaches its props to the element only once the page has hydrated; without the nonce it never would.
      await expect
        .poll(() =>
          link.evaluate((el) =>
            Object.entries(el).some(
              ([key, props]) => key.startsWith("__reactProps$") && typeof props?.onClick === "function",
            ),
          ),
        )
        .toBe(true);
      await link.click();
      await expect(page).toHaveURL(/\/dashboard\/today$/);
    },
  );

  test("the landing page links to Help at the top", async ({ page, isMobile }) => {
    test.skip(isMobile, "the header link is hidden on a phone to save room");
    await page.goto("/");
    await page.getByRole("link", { name: "Help", exact: true }).first().click();
    await expect(page).toHaveURL(/\/help$/);
  });

  test("on a phone the landing page fits the screen: header, the hero buttons and the footer links", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "this is about the phone layout");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const screenWidth = await page.evaluate(() => window.screen.width);
    // The page is no wider than the screen (a header that is too wide makes the whole page slide sideways).
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(screenWidth + 1);
    // Every header link ends inside the screen.
    for (const link of await page.locator("header nav a:visible").all()) {
      const box = await link.boundingBox();
      expect(box && box.x + box.width, `header link "${await link.textContent()}"`).toBeLessThanOrEqual(
        screenWidth - 8,
      );
    }
    // The redesigned hero has two buttons and a text link ("Connect your assistant") under the headline; all stay on the screen.
    const hero = page.locator("main section").first();
    await expect(hero.getByRole("link", { name: "Connect your assistant" })).toBeVisible();
    for (const el of [
      hero.getByRole("link", { name: "Create a free account" }),
      hero.getByRole("button", { name: /Try the demo/ }),
    ]) {
      const box = await el.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= screenWidth - 8, `hero button inside the screen`).toBe(true);
    }
    // A footer link never breaks onto two lines.
    for (const link of await page.locator("footer a").all()) {
      const box = await link.boundingBox();
      expect(box?.height ?? 0, `footer link "${await link.textContent()}"`).toBeLessThan(44);
    }
  });

  test("the health check answers and a signed-out visitor is sent to log in", async ({ page, request }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({
      ok: true,
      db: { selectMs: expect.any(Number), probeMs: expect.any(Number) },
    });
    await page.goto("/dashboard/today");
    await expect(page).toHaveURL(/\/auth\/v2\/login/);
    // The Year summary renders in the browser only (issue 280), and still sends a signed-out visitor to log in.
    await page.goto("/dashboard/report");
    await expect(page).toHaveURL(/\/auth\/v2\/login/);
  });

  test("a made-up shared link says it isn't available, for timesheets and invoices alike", async ({ page, audit }) => {
    for (const kind of ["timesheet", "invoice"]) {
      await page.goto(`/${kind}/${"a".repeat(43)}`);
      await expect(page.getByRole("heading", { name: /isn't available any more/i })).toBeVisible();
      await audit(`${kind} link not available`);
    }
  });

  test("a wrong password says so and stays on the log in page", async ({ page }) => {
    await page.goto("/auth/v2/login");
    await page.getByLabel("Email", { exact: true }).fill("nobody@example.test");
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page
      .getByRole("button", { name: /log in|sign in/i })
      .first()
      .click();
    await expect(page.getByText("Wrong email or password.")).toBeVisible();
    await expect(page).toHaveURL(/login/);
  });

  test("the sign-up form never puts what you typed in the address bar, even before the page's script runs", async ({
    page,
  }) => {
    await page.goto("/auth/v2/register");
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Create account" }) });
    expect(await form.getAttribute("method")).toBe("post");
  });
});
