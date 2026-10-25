import { expect, test } from "./helpers";

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
