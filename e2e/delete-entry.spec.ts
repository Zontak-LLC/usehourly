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
