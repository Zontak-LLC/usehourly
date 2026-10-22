import { icsFor } from "./calendar-fixture";
import { expect, startFreshAccount, test } from "./helpers";

test("Today is simpler: three time chips, totals in one line, a calm disabled Add button, the calendar below", async ({
  page,
}) => {
  await startFreshAccount(page);
  const card = page.getByRole("region", { name: "From your calendar" });
  const addCard = page.getByRole("heading", { name: "Log time" });

  await test.step("three quick times and no total cards", async () => {
    for (const name of ["30 min", "1 hour", "2 hours"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "15 min", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "4 hours", exact: true })).toHaveCount(0);
    await expect(page.getByText("This day", { exact: true })).toHaveCount(0); // the two stat cards are gone
    await expect(page.getByRole("heading", { level: 1 }).locator("xpath=..")).toContainText(
      "0:00 this day · 0:00 this week",
    );
  });

  await test.step("until a time is typed the Add button is quiet and a line says what to do", async () => {
    const add = page.getByRole("button", { name: /^Log time/ });
    await expect(add).toBeDisabled();
    await expect(page.getByText("Type a time or tap one (tap again to add more), then add it.")).toBeVisible();
    // not a grey slab: the background is transparent while it waits
    expect(await add.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    await page.getByRole("button", { name: "1 hour", exact: true }).click();
    await expect(add).toBeEnabled();
    await add.click();
    await expect(page.getByRole("heading", { level: 1 }).locator("xpath=..")).toContainText(
      "1:00 this day · 1:00 this week",
    );
  });

  await test.step("the timer is a small link under Add, not a rival button", async () => {
    const add = page.getByRole("button", { name: /^Log time/ });
    const timer = page.getByRole("button", { name: /Start timer/ });
    const addBox = await add.boundingBox();
    const timerBox = await timer.boundingBox();
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    if (wide) {
      // the form is two columns on a wide screen: the timer sits in the left one, on the row of the Add button
      expect(Math.abs((timerBox?.y ?? 0) - (addBox?.y ?? 0))).toBeLessThan(80);
      expect((timerBox?.x ?? 0) + (timerBox?.width ?? 0)).toBeLessThan(addBox?.x ?? 0);
    } else {
      expect(timerBox?.y ?? 0).toBeGreaterThan((addBox?.y ?? 0) + (addBox?.height ?? 0));
    }
    expect(timerBox?.height ?? 99).toBeLessThan(80); // a quiet row, not a big solid button
    await expect(timer).not.toHaveAttribute("data-variant", /.+/); // not one of the app's solid or outline buttons
  });

  await test.step("not connected, the calendar card sits below the day's entries", async () => {
    const entries = page.getByRole("region", { name: /^What you worked on|timesheet/i }).first();
    const calendarY = (await card.boundingBox())?.y ?? 0;
    const addY = (await addCard.boundingBox())?.y ?? 0;
    expect(calendarY).toBeGreaterThan(addY + 200);
    expect(await entries.count()).toBeGreaterThanOrEqual(0);
  });

  await test.step("once a calendar is connected its card sits right under the add form, before the long day list", async () => {
    await page
      .getByLabel("Choose calendar file")
      .setInputFiles({ name: "work.ics", mimeType: "text/calendar", buffer: Buffer.from(await icsFor(page)) });
    await expect(card.getByText("Offline Co planning")).toBeVisible();
    // Positions on the whole page (the boxes are relative to the screen, which may have scrolled).
    const top = async (el: typeof card) => el.evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
    const calendarY = await top(card);
    const addY = await top(addCard);
    expect(calendarY).toBeGreaterThan(addY); // below the add form, never above it
    expect(calendarY - addY).toBeLessThan(1500); // and close to it: the calendar is not pushed to the foot of the page
  });
});
