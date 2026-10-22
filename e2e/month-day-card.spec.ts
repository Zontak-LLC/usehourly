import { expect, test } from "@playwright/test";

test("a day on Month opens as a card under the calendar, not a pop-up, and closes again", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/dashboard/month");

  // a day with time in it (the sample data has entries on recent weekdays)
  const day = page.getByRole("button", { name: /^\d{4}-\d\d-\d\d: [1-9]/ }).first();
  const label = (await day.getAttribute("aria-label")) ?? "";
  await day.click();

  await expect(page.getByRole("dialog")).toHaveCount(0); // in place, not a pop-up
  const card = page.getByRole("region", { name: /^\w+day, \w+ \d+, \d{4}$/ });
  await expect(card).toBeVisible();
  await expect(card.getByText(label.slice(0, 10).slice(8))).toBeDefined();
  await expect(card.getByRole("button", { name: "Close" })).toBeVisible();
  await expect(card.getByLabel("Time to add")).toBeVisible(); // the add form is inside it
  await expect(card.getByRole("link", { name: "Open this day's full page" })).toHaveAttribute(
    "href",
    new RegExp(`date=${label.slice(0, 10)}`),
  );

  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toHaveCount(0);
});
