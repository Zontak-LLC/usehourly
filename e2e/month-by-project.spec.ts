import { expect, test } from "@playwright/test";

test("What you worked on: project chips narrow the list, and it can be read by day or by project", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/dashboard/month");

  const list = page.getByRole("region", { name: "What you worked on" });
  await expect(list).toBeVisible();
  const heading = list.getByRole("heading", { level: 2 });
  const countOf = async () => Number(/\((\d+)\)/.exec((await heading.textContent()) ?? "")?.[1]);
  const all = await countOf();
  expect(all).toBeGreaterThan(1);

  await test.step("the chips: All projects plus one per project, each with its hours", async () => {
    const chips = page.getByRole("group", { name: "Filter by project" }).getByRole("button");
    expect(await chips.count()).toBeGreaterThan(2);
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    await expect(chips.nth(1)).toContainText(/\d+:\d\d/);
  });

  await test.step("choosing a project narrows the list, and All projects brings it back", async () => {
    const chips = page.getByRole("group", { name: "Filter by project" }).getByRole("button");
    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(countOf).toBeLessThan(all);
    await chips.first().click();
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
