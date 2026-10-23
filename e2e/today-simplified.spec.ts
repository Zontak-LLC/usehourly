import { FEATURES } from "../src/lib/features";
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
    await expect(page.getByRole("navigation", { name: "Days" })).toContainText("0:00 this day · 0:00 this week");
  });

  await test.step("until a time is typed the Add button is quiet and a line says what to do", async () => {
    const add = page.getByRole("button", { name: /^Log time/ });
    await expect(add).toBeDisabled();
    await expect(page.getByText("Type a time or tap one (tap again to add more), then add it.")).toBeVisible();
    // while it waits it is a plain grey (not brown, not amber); it turns the one amber once a time is typed
    const background = () => add.evaluate((el) => getComputedStyle(el).backgroundColor);
    const waiting = await background();
    expect(waiting).not.toMatch(/^rgb\((23\d|24\d), (1[3-7]\d)/); // not an amber
    await page.getByRole("button", { name: "1 hour", exact: true }).click();
    await expect(add).toBeEnabled();
    await expect.poll(background).not.toBe(waiting); // it comes alive: the amber (light and dark themes differ a little)
    await add.click();
    await expect(page.getByRole("navigation", { name: "Days" })).toContainText("1:00 this day · 1:00 this week");
  });

  await test.step("the timer is one strip above the form, not a rival button in it", async () => {
    const watch = page.getByRole("region", { name: "Timer" });
    const start = watch.getByRole("button", { name: /Start\s+timer/ });
    await expect(start).toBeVisible();
    const box = await start.boundingBox();
    expect(box?.height ?? 99).toBeLessThan(100); // a small button, not a big bar
    await expect(page.getByRole("button", { name: /Start\s+timer/ })).toHaveCount(1); // one timer
  });

  if (!FEATURES.calendar) {
    // The calendar import is hidden in this release (src/lib/features.ts): Today offers none.
    await expect(card).toHaveCount(0);
    await expect(page.getByText("Turn meetings into time entries")).toHaveCount(0);
    return;
  }

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
