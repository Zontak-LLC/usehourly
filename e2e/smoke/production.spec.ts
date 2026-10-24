import { entryAction, expect, test } from "../helpers";

/**
 * The after-deploy smoke test (docs/operations.md, "After a deploy"). It runs against the REAL site and touches nothing
 * of anyone's: it uses "Try it with sample data" (a throwaway account the app deletes itself within 24 hours) and does
 * a little of everything a person does: look at every main page, add a day entry, edit it, delete it. Any uncaught
 * error, console error or HTTP 5xx fails it (the shared `test` fixture watches for them). If it fails twice in a row
 * after a production deploy, the pipeline rolls the site back to the previous version.
 *
 *   E2E_BASE_URL=https://usehourly.app npx playwright test e2e/smoke --project=desktop --project=phone
 */
test.describe.configure({ retries: 1 });
// The real site can be slow on a first request (a cold Worker, a cold database): wait longer than the usual 5 seconds
// before calling anything a failure, so a slow load never causes a rollback.
test.setTimeout(120_000);
expect.configure({ timeout: 30_000 });

test("public pages and the health check answer", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ ok: true });
  for (const path of ["/", "/auth/v2/login", "/auth/v2/register", "/help", "/privacy"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }
});

test("sample account: every main page loads, and an entry can be added, edited and deleted", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo|try it with sample data/i })
    .first()
    .click();
  // A shared connection (the CI runner) can hit the sample-account limit (5 an hour). That says nothing about the
  // deploy, so it must never trigger a rollback: skip instead.
  const started = await Promise.race([
    page.waitForURL(/dashboard/).then(() => "started"),
    page
      .getByRole("alert")
      .filter({ hasText: /limit may have been reached/ })
      .waitFor()
      .then(() => "limited"),
  ]);
  test.skip(started === "limited", "sample accounts are rate limited from this connection");

  await test.step("Today: add an entry", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await page.getByLabel("Time to add").fill("1");
    await page.getByLabel("Description").fill("smoke test entry");
    await page.getByRole("button", { name: /^Log time/ }).click();
    await expect(page.getByText("smoke test entry").first()).toBeVisible();
  });

  const row = () => page.getByRole("listitem").filter({ hasText: "smoke test entry" }).first();

  await test.step("Today: edit it", async () => {
    await row().getByRole("button", { name: "Edit", exact: true }).click();
    await row().getByLabel("Time", { exact: true }).fill("2:00");
    await row().getByRole("button", { name: "Save", exact: true }).click();
    await expect(row()).toContainText("2:00");
  });

  await test.step("Today: delete it (the question opens in its card)", async () => {
    await entryAction(row(), "Delete");
    await row()
      .getByRole("region", { name: "Delete this entry?" })
      .getByRole("button", { name: "Delete entry" })
      .click();
    await expect(page.getByText("smoke test entry")).toHaveCount(0);
  });

  const pages: [string, RegExp | string][] = [
    ["/dashboard/week", "Weekly timesheet"],
    ["/dashboard/month", /20\d\d$/],
    ["/dashboard/invoices", "Invoices"],
    ["/dashboard/clients", "Clients"],
    ["/dashboard/report", /Year summary|20\d\d/],
  ];
  for (const [path, heading] of pages) {
    await test.step(`${path} loads`, async () => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(heading);
      await page.waitForLoadState("networkidle");
    });
  }

  await test.step("Month: a picked day shows beside the calendar, and Whole month lists the month", async () => {
    await page.goto("/dashboard/month");
    const day = page.getByRole("button", { name: /^\d{4}-\d\d-15: / }); // the 15th is always in the month
    await day.click();
    await expect(day).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/date=\d{4}-\d\d-\d\d/);
    await expect(page.getByRole("region", { name: /^\w+day, \w+ \d+$/ })).toBeVisible();
    await page.getByRole("button", { name: "Whole month", exact: true }).click();
    await expect(page).toHaveURL(/view=month/);
  });
});
