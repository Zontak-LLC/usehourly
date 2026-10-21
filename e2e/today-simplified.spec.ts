import { icsFor } from "./calendar-fixture";
import { expect, startFreshAccount, test } from "./helpers";

test("Today is simpler: three time chips, totals in one line, a calm disabled Add button, the calendar below", async ({
  page,
}) => {
  await startFreshAccount(page);
  const card = page.getByRole("region", { name: "From your calendar" });
  const addCard = page.getByRole("heading", { name: "Add to the day" });

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
    const add = page.getByRole("button", { name: /^Add to the day/ });
    await expect(add).toBeDisabled();
    await expect(page.getByText("Type a time or tap one, then add it.")).toBeVisible();
    // not a grey slab: the background is transparent while it waits
    expect(await add.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    await page.getByRole("button", { name: "1 hour", exact: true }).click();
    await expect(add).toBeEnabled();
    await add.click();
    await expect(page.getByRole("heading", { level: 1 }).locator("xpath=..")).toContainText(
      "1:00 this day · 1:00 this week",
    );
  });

  await test.step("not connected, the calendar card sits below the day's entries", async () => {
    const entries = page.getByRole("region", { name: /^What you worked on|timesheet/i }).first();
    const calendarY = (await card.boundingBox())?.y ?? 0;
    const addY = (await addCard.boundingBox())?.y ?? 0;
    expect(calendarY).toBeGreaterThan(addY + 200);
    expect(await entries.count()).toBeGreaterThanOrEqual(0);
  });

  await test.step("once a calendar is connected its card moves up under the add form", async () => {
    await page
      .getByLabel("Choose calendar file")
      .setInputFiles({ name: "work.ics", mimeType: "text/calendar", buffer: Buffer.from(await icsFor(page)) });
    await expect(card.getByText("Offline Co planning")).toBeVisible();
    const calendarY = (await card.boundingBox())?.y ?? 0;
    const entry = (await page.getByText("1:00", { exact: true }).first().boundingBox())?.y ?? 0;
    expect(calendarY).toBeLessThan(entry + 400);
  });
});
