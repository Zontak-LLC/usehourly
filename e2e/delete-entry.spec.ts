import { expect, startFreshAccount, test } from "./helpers";

/** Deleting time always asks first and says which entry it is, from the "What you worked on" list and from an entry on Today. */
test("an entry is deleted only after confirming, from the list and from Today", async ({ page }) => {
  await startFreshAccount(page);
  const add = async (time: string, note: string) => {
    await page.getByLabel("Time to add").fill(time);
    await page.getByLabel("Description").fill(note);
    await page.getByRole("button", { name: /Add to the day/ }).click();
    await expect(page.getByText(note)).toBeVisible();
    await expect(page.getByLabel("Time to add")).toHaveValue(""); // the form clears itself just after saving
  };
  await add("1.5", "keep me");
  await add("2", "delete me from the list");
  await add("0:45", "delete me on Today");

  await test.step("from What you worked on: cancelling keeps it, confirming removes it", async () => {
    await page.goto("/dashboard/week");
    await expect(page.getByText("delete me from the list").first()).toBeVisible();
    const list = page.getByRole("region", { name: "What you worked on" });
    const card = list.getByRole("listitem").filter({ hasText: "delete me from the list" });
    await card.getByRole("button", { name: "Delete" }).click(); // in the entry card's header, like on Today
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Delete this entry?" })).toBeVisible();
    await expect(dialog).toContainText("delete me from the list"); // it says which entry
    await expect(dialog).toContainText("2:00");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("delete me from the list").first()).toBeVisible();

    await card.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete entry" }).click();
    await expect(page.getByText("delete me from the list")).toHaveCount(0);
    await expect(page.getByText("keep me").first()).toBeVisible();
  });

  await test.step("on Today the entry's own delete button asks too", async () => {
    await page.goto("/dashboard/today");
    await expect(page.getByText("delete me on Today").first()).toBeVisible();
    await page
      .getByRole("listitem")
      .filter({ hasText: "delete me on Today" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("delete me on Today");
    await page.getByRole("dialog").getByRole("button", { name: "Delete entry" }).click();
    await expect(page.getByText("delete me on Today")).toHaveCount(0);
    await expect(page.getByText("keep me").first()).toBeVisible();
  });
});

test("the Week page shows a colour dot on a day with time, and none on an empty day", async ({ page }) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/week");
  const today = new Date().getDay(); // the tile for today
  const tiles = page.getByRole("tab");
  await expect(tiles.first()).toBeVisible();
  await expect(page.locator("[role=tab] [data-dot]")).toHaveCount(0); // a new account has no time: no dots anywhere
  await expect(page.getByRole("region", { name: "What you worked on" })).toHaveCount(0); // and no empty "What you worked on"
  await page.getByLabel("Time to add").fill("1");
  await page.getByRole("button", { name: /Add to the day/ }).click();
  await expect(page.locator("[role=tab] [data-dot]")).toHaveCount(1); // one client, one day
  await expect(page.getByRole("region", { name: "What you worked on" })).toBeVisible(); // the list appears with the first entry
  const withDot = page.getByRole("tab").filter({ has: page.locator("[data-dot]") });
  await expect(withDot).toHaveCount(1);
  await expect(withDot).toHaveAttribute("aria-selected", "true");
  void today;
});

test("the Week page keeps the day you picked in the address, so a refresh comes back to it", async ({ page }) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/week?date=2026-09-09");
  await expect(page.getByRole("tab", { name: /Wednesday, September 9/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /Friday, September 11/ }).click();
  await expect(page).toHaveURL(/date=2026-09-11/);
  await page.reload();
  await expect(page.getByRole("tab", { name: /Friday, September 11/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page).toHaveURL(/date=2026-09-14/); // the Monday of the week now showing
  await page.reload();
  await expect(page.getByRole("tab", { name: /Monday, September 14/ })).toBeVisible();
});

test("a day's total says it is the total, and the day has a labelled Edit day button apart from the entry buttons", async ({
  page,
}) => {
  await startFreshAccount(page);
  await page.getByLabel("Time to add").fill("1.5");
  await page.getByLabel("Description").fill("labelled total");
  await page.getByRole("button", { name: /Add to the day/ }).click();
  await expect(page.getByText("labelled total")).toBeVisible();
  await page.goto("/dashboard/week");
  const list = page.getByRole("region", { name: "What you worked on" });
  await expect(list.getByText("Total", { exact: true })).toBeVisible();
  await expect(list.getByRole("button", { name: /^Edit .*\d/ })).toContainText("Edit day"); // words on the day's button
  await expect(list.getByRole("button", { name: "Edit", exact: true })).toHaveCount(1); // the entry's own pencil is icon-only
  await expect(page.getByText("Total hours this week", { exact: true })).toBeVisible();
});

test("Edit day on the Week page opens that day's entries for editing, and saving changes the time", async ({
  page,
}) => {
  await startFreshAccount(page);
  await page.getByLabel("Time to add").fill("1.5");
  await page.getByLabel("Description").fill("edit me from the day button");
  await page.getByRole("button", { name: /Add to the day/ }).click();
  await expect(page.getByText("edit me from the day button")).toBeVisible();
  await page.goto("/dashboard/week");
  const list = page.getByRole("region", { name: "What you worked on" });
  await list.getByRole("button", { name: /^Edit .*\d/ }).click(); // "Edit day"
  await expect(list.getByRole("button", { name: "Save" })).toBeVisible(); // the entry is now a form
  await list.getByLabel("Time", { exact: true }).fill("2");
  await list.getByRole("button", { name: "Save" }).click();
  await expect(list.getByText("2:00").first()).toBeVisible();
  await expect(list.getByRole("button", { name: "Save" })).toHaveCount(0); // back to reading
});
