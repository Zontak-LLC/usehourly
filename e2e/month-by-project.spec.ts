import { expect, test } from "@playwright/test";

test("By project shows one figure per project and no lonely tile on a wide screen", async ({ page }, info) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/dashboard/month");

  const card = page.getByRole("region", { name: "By project" });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText(/\d+\.\d\d h/); // the decimal hours said the same thing twice
  const tiles = card.locator("button[aria-pressed]");
  const count = await tiles.count();
  expect(count).toBeGreaterThan(0);

  if (info.project.name === "desktop" && count <= 4) {
    // all tiles share one row: the same top edge
    const tops = await tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
  }
});

test("a paid invoice's button says what it does: Edit payment", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the labelled phone row");
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/dashboard/invoices");
  const card = page.getByRole("region", { name: "Your invoices" });
  await expect(card.getByText("Edit payment", { exact: true }).locator("visible=true").first()).toBeVisible();
  await expect(card.getByText("Payment", { exact: true }).locator("visible=true")).toHaveCount(0);
});
