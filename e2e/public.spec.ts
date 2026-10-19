import { expect, test } from "./helpers";

/** What a stranger can reach without signing in: it must load cleanly, read well on a phone, and not leak or break. */
const PUBLIC_PAGES: [string, string][] = [
  ["/", "landing"],
  ["/auth/v2/login", "log in"],
  ["/auth/v2/register", "sign up"],
  ["/privacy", "privacy"],
  ["/terms", "terms"],
  ["/tools/hours-calculator", "hours calculator"],
  ["/help", "guide"],
  ["/help/faq", "faq"],
  ["/help/rounding", "guide topic"],
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

  test("the landing page links to the guide at the top", async ({ page, isMobile }) => {
    test.skip(isMobile, "the header link is hidden on a phone to save room");
    await page.goto("/");
    await page.getByRole("link", { name: "Guide", exact: true }).first().click();
    await expect(page).toHaveURL(/\/help$/);
  });

  test("the health check answers and a signed-out visitor is sent to log in", async ({ page, request }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
    await page.goto("/dashboard/today");
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
