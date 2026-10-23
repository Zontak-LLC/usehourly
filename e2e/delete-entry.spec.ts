import { entryAction, expect, openAllEntries, startFreshAccount, test } from "./helpers";

/** Deleting time always asks first and says which entry it is, from the "What you worked on" list and from an entry on Today. */
test("an entry is deleted only after confirming, from the list and from Today", async ({ page }) => {
  await startFreshAccount(page);
  const add = async (time: string, note: string) => {
    await page.getByLabel("Time to add").fill(time);
    await page.getByLabel("Description").fill(note);
    await page.getByRole("button", { name: /Log time/ }).click();
    await expect(page.getByText(note)).toBeVisible();
    await expect(page.getByLabel("Time to add")).toHaveValue(""); // the form clears itself just after saving
  };
  await add("1.5", "keep me");
  await add("2", "delete me from the list");
  await add("0:45", "delete me on Today");

  await test.step("from What you worked on: cancelling keeps it, confirming removes it", async () => {
    await page.goto("/dashboard/week");
    await expect(page.getByText("delete me from the list").first()).toBeVisible();
    await openAllEntries(page);
    const list = page.getByRole("region", { name: "What you worked on" });
    // .last(): the day's group is a list item too; the entry's own card is the innermost match.
    const card = list.getByRole("listitem").filter({ hasText: "delete me from the list" }).last();
    await entryAction(card, "Delete"); // the red Delete at the foot of the entry's edit form, like on Today
    // the question opens inside the entry's own card (not a pop-up) and names the entry
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const ask = card.getByRole("region", { name: "Delete this entry?" });
    await expect(ask).toBeVisible();
    await expect(ask).toContainText("delete me from the list"); // it says which entry
    await expect(ask).toContainText("2:00");
    await ask.getByRole("button", { name: "Cancel" }).click();
    await expect(ask).toBeHidden();
    await expect(page.getByText("delete me from the list").first()).toBeVisible();

    // Cancelling the question leaves the edit form open, so its Delete is right there again.
    await card.getByRole("button", { name: "Delete", exact: true }).click();
    await card
      .getByRole("region", { name: "Delete this entry?" })
      .getByRole("button", { name: "Delete entry" })
      .click();
    await expect(page.getByText("delete me from the list")).toHaveCount(0);
    await expect(page.getByText("keep me").first()).toBeVisible();
  });

  await test.step("on Today the entry's own delete button asks too", async () => {
    await page.goto("/dashboard/today");
    await expect(page.getByText("delete me on Today").first()).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: "delete me on Today" });
    await entryAction(row, "Delete");
    const ask = row.getByRole("region", { name: "Delete this entry?" });
    await expect(ask).toContainText("delete me on Today");
    await ask.getByRole("button", { name: "Delete entry" }).click();
    await expect(page.getByText("delete me on Today")).toHaveCount(0);
    await expect(page.getByText("keep me").first()).toBeVisible();
  });
});

test("the Week page's day buttons show the time of a day with time, and nothing on an empty day", async ({ page }) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/week");
  const days = page.getByRole("navigation", { name: "This week" }).getByRole("button");
  await expect(days).toHaveCount(7);
  const withTime = page.locator('nav[aria-label="This week"] button:not([aria-label*="nothing logged"])');
  await expect(withTime).toHaveCount(0); // a new account has no time anywhere
  await expect(page.getByRole("button", { name: /All entries this week/ })).toHaveCount(0); // no empty list to open
  await page.getByLabel("Time to add").fill("1");
  await page.getByRole("button", { name: /Log time/ }).click();
  await expect(withTime).toHaveCount(1); // one day has time
  await expect(withTime).toHaveAccessibleName(/, 1:00$/);
  await expect(withTime).toHaveAttribute("aria-current", "date"); // it is the day being shown
  await expect(page.getByRole("button", { name: /All entries this week · 1/ })).toBeVisible(); // the list appears with the first entry
});

test("the Week page keeps the day you picked in the address, so a refresh comes back to it", async ({ page }) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/week?date=2026-09-09");
  const day = (name: RegExp) => page.getByRole("navigation", { name: "This week" }).getByRole("button", { name });
  await expect(day(/Wednesday, September 9/)).toHaveAttribute("aria-current", "date");
  await day(/Friday, September 11/).click();
  await expect(page).toHaveURL(/date=2026-09-11/);
  await page.reload();
  await expect(day(/Friday, September 11/)).toHaveAttribute("aria-current", "date");
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page).toHaveURL(/date=2026-09-14/); // the Monday of the week now showing
  await page.reload();
  await expect(day(/Monday, September 14/)).toBeVisible();
});

test("a day's total says it is the total, and the day has a labelled Edit day button apart from the entry buttons", async ({
  page,
}) => {
  await startFreshAccount(page);
  await page.getByLabel("Time to add").fill("1.5");
  await page.getByLabel("Description").fill("labelled total");
  await page.getByRole("button", { name: /Log time/ }).click();
  await expect(page.getByText("labelled total")).toBeVisible();
  await page.goto("/dashboard/week");
  await openAllEntries(page);
  const list = page.getByRole("region", { name: "What you worked on" });
  await expect(list.getByText("Total", { exact: true })).toBeVisible();
  await expect(list.getByRole("button", { name: /^Edit .*\d/ })).toContainText("Edit day"); // words on the day's button
  await expect(list.getByRole("button", { name: "Edit", exact: true })).toHaveCount(1); // the entry's own pencil is icon-only
  await expect(page.getByRole("heading", { name: "By project · 1:30" })).toBeVisible(); // the week's time by project, in h:mm
});

test("Edit day on the Week page opens that day's entries for editing, and saving changes the time", async ({
  page,
}) => {
  await startFreshAccount(page);
  await page.getByLabel("Time to add").fill("1.5");
  await page.getByLabel("Description").fill("edit me from the day button");
  await page.getByRole("button", { name: /Log time/ }).click();
  await expect(page.getByText("edit me from the day button")).toBeVisible();
  await page.goto("/dashboard/week");
  await openAllEntries(page);
  const list = page.getByRole("region", { name: "What you worked on" });
  await list.getByRole("button", { name: /^Edit .*\d/ }).click(); // "Edit day"
  await expect(list.getByRole("button", { name: "Save" })).toBeVisible(); // the entry is now a form
  await list.getByLabel("Time", { exact: true }).fill("2");
  await list.getByRole("button", { name: "Save" }).click();
  await expect(list.getByText("2:00").first()).toBeVisible();
  await expect(list.getByRole("button", { name: "Save" })).toHaveCount(0); // back to reading
});
