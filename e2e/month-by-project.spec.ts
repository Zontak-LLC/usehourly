import { expect, test } from "@playwright/test";

import { openAllEntries, startDemo } from "./helpers";

test("All entries: the project filter narrows the list, and it can be read by day or by project", async ({ page }) => {
  await startDemo(page);
  await page.goto("/dashboard/month");
  await openAllEntries(page); // folded behind "All entries this month"

  const list = page.getByRole("region", { name: /^All entries this (week|month)$/ });
  await expect(list).toBeVisible();
  const heading = list.getByRole("heading", { level: 2 });
  const countOf = async () => Number(/\((\d+)\)/.exec((await heading.textContent()) ?? "")?.[1]);
  const all = await countOf();
  expect(all).toBeGreaterThan(1);

  await test.step("the list has no chip row of its own: the toolbar's project filter narrows it", async () => {
    await expect(page.getByRole("group", { name: "Filter by project" })).toHaveCount(0);
    const filter = page.getByRole("combobox", { name: "Filter by project" });
    const options = filter.locator("option");
    expect(await options.count()).toBeGreaterThan(2); // All projects plus one per project
    await filter.selectOption({ index: 1 });
    await expect(page).toHaveURL(/project=/);
    await expect.poll(countOf).toBeLessThan(all);
    await filter.selectOption({ index: 0 });
    await expect.poll(countOf).toBe(all);
  });

  await test.step("by project groups the same entries under each project, with its total", async () => {
    await list.getByRole("button", { name: "By project" }).click();
    await expect(list.getByRole("button", { name: "By project" })).toHaveAttribute("aria-pressed", "true");
    await expect(list.locator("h3").first()).toContainText("·"); // "Project · Client"
    await expect(list.getByText("Total").first()).toBeVisible();
    await list.getByRole("button", { name: "By day" }).click();
    await expect(list.getByRole("button", { name: "By day" })).toHaveAttribute("aria-pressed", "true");
  });
});
