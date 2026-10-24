import { expect, startFreshAccount, test } from "./helpers";

/**
 * Issue #218: an entry row holds no hidden controls. A click on the row opens its edit form (it used to open an
 * invisible project picker that moved the entry with no undo), and moving it with the Day field offers Undo, as dragging
 * on Month does.
 */
test("a click on an entry opens Edit, and a move by the Day field can be undone", async ({ page }) => {
  await startFreshAccount(page, "Acme");
  await page.getByLabel("Time to add").fill("1");
  await page.getByLabel("Description").fill("row click opens edit");
  await page.getByRole("button", { name: /Log time/ }).click();
  const sheet = page.getByRole("region", { name: "Today's entries" });
  const row = sheet.getByRole("listitem").filter({ hasText: "row click opens edit" });
  await expect(row).toBeVisible();
  await expect(row).not.toHaveAttribute("aria-busy", "true");

  await test.step("no hidden project picker on the row", async () => {
    await expect(page.getByRole("combobox", { name: "Move to another project" })).toHaveCount(0);
    await expect(row.getByRole("combobox")).toHaveCount(0);
  });

  await test.step("a click on the row's words opens the edit form", async () => {
    await row.getByText("row click opens edit").click();
    await expect(row.getByRole("button", { name: "Edit", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(row.getByLabel("Day")).toBeVisible();
  });

  const { today, yesterday } = await page.evaluate(() => {
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const now = new Date();
    const before = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return { today: iso(now), yesterday: iso(before) };
  });

  await test.step("moving it with the Day field shows Undo, and Undo brings it back", async () => {
    await row.getByLabel("Day").fill(yesterday);
    await row.getByRole("button", { name: "Save", exact: true }).click();
    const moved = page.locator("[data-sonner-toast]").filter({ hasText: /^Moved to/ });
    await expect(moved).toBeVisible();
    await expect(page.getByText("row click opens edit")).toHaveCount(0); // it left today
    await moved.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: /Moved back to/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Today's entries" })).toContainText("row click opens edit");
    // and the server agrees: after a reload it is still on today
    await page.reload();
    await expect(page.getByRole("region", { name: "Today's entries" })).toContainText("row click opens edit");
    expect(today).not.toBe(yesterday);
  });
});
