import { expect, startFreshAccount, test } from "./helpers";

// No clocks in the app (2026-10-23): most people log after the fact, so Today's timer is a slim strip above the add form
// (only on today's date: a timer runs only today), and Week shows its hours as a progress line.
test("Today's timer is a slim strip on today only, and Week has a progress line instead of a clock", async ({
  page,
}) => {
  await startFreshAccount(page, "Acme");
  const timer = page.getByRole("region", { name: "Timer" });

  await test.step("today: a slim timer strip above the form, no watch", async () => {
    await expect(timer.getByRole("button", { name: "Start timer" })).toBeVisible();
    const box = await timer.boundingBox();
    expect(box?.height ?? 999).toBeLessThan(90); // a strip, not a big panel
    const formTop = (await page.getByRole("heading", { name: "Log time" }).boundingBox())?.y ?? 0;
    expect(box?.y ?? 999).toBeLessThan(formTop); // above the form
    await expect(page.getByRole("img", { name: /^Time now|^Logged today/ })).toHaveCount(0);
  });

  await test.step("another day: no timer strip, the add form is still there", async () => {
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page.getByRole("heading", { name: "Log time" })).toBeVisible();
    await expect(timer).toHaveCount(0);
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(timer).toBeVisible();
  });

  await test.step("Week: no clock, the week's hours against 40 as a progress line", async () => {
    await page.getByRole("button", { name: "1 hour", exact: true }).click();
    await page.getByRole("button", { name: /^Log time/ }).click();
    await expect(page.getByRole("navigation", { name: "Days" })).toContainText("1:00 this day");
    await page.goto("/dashboard/week");
    await expect(page.getByRole("region", { name: "This week" })).toContainText("1:00 of 40:00 this week");
    await expect(page.getByRole("progressbar", { name: "Hours this week, out of 40" })).toHaveAttribute(
      "aria-valuenow",
      "3",
    );
    await expect(page.getByRole("region", { name: "Timer" })).toHaveCount(0);
  });
});
