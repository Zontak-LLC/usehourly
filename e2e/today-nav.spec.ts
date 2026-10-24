import { expect, startFreshAccount, test, today } from "./helpers";

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/*
 * Today walks one day at a time (2026-10-23): the arrows, a date button with a month calendar, and buttons for recent
 * weekdays with no time. The row of seven day tiles is Week's, not Today's.
 */
test("Today: the arrows, the day calendar and the days with no time all open the right day", async ({ page }) => {
  await startFreshAccount(page);
  const now = today();
  const weekAgo = addDays(now, -7);

  await test.step("a new account sees no missed days and no week row", async () => {
    await expect(page.getByRole("navigation", { name: "Days with no time" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "This week" })).toHaveCount(0);
  });

  await test.step("time a week ago: the weekdays after it are listed and open their day", async () => {
    await page.goto(`/dashboard/today?date=${weekAgo}`);
    await page.getByLabel("Time to add").fill("1");
    await page.getByRole("button", { name: /^Log time/ }).click();
    await expect(page.getByText(/1:00 this day/).first()).toBeVisible();
    await page.goto("/dashboard/today");
    const missed = page.getByRole("navigation", { name: "Days with no time" });
    // Between a week ago and today there are always at least four weekdays: the last one has its own line ("Nothing
    // logged on ...", issue 99), and of the rest three show as buttons, any more are counted.
    await expect(page.getByRole("region", { name: "Missed day" })).toContainText("Nothing logged on");
    await expect(missed.getByRole("button")).toHaveCount(3);
    const first = missed.getByRole("button").first();
    const label = (await first.getAttribute("aria-label")) ?? "";
    await first.click();
    await expect(page).toHaveURL(/\/dashboard\/today\?date=\d{4}-\d{2}-\d{2}$/);
    const picked = new URL(page.url()).searchParams.get("date") ?? "";
    expect(picked > weekAgo && picked < now).toBe(true);
    await expect(page.getByRole("button", { name: /^Pick a day/ })).toHaveAccessibleName(
      new RegExp(`showing ${label.split(":")[0]}`),
    );
  });

  await test.step("the calendar marks the day with time, opens it, and goes back to today", async () => {
    await page.getByRole("button", { name: /^Pick a day/ }).click();
    const withTime = page.getByRole("button", { name: /, 1:00$/ });
    await expect(withTime).toHaveCount(1);
    await withTime.click();
    await expect(page).toHaveURL(new RegExp(`date=${weekAgo}$`));
    await page.getByRole("button", { name: /^Pick a day/ }).click();
    await page.getByRole("button", { name: "Go to today" }).click();
    await expect(page).toHaveURL(/\/dashboard\/today$/);
  });

  await test.step("the arrow keys move in the calendar, and the day buttons still walk a day", async () => {
    await page.getByRole("button", { name: /^Pick a day/ }).click();
    await page.getByRole("button", { name: /, today$/ }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(`[data-date="${addDays(now, -1)}"]`)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`date=${addDays(now, -1)}$`));
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(page).toHaveURL(/\/dashboard\/today$/);
  });
});
