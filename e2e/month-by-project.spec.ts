import { expect, test } from "@playwright/test";

test("By project is a list of rows with one figure each", async ({ page }) => {
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

  // rows, not tiles: they stack, one under the other, each as wide as the card and with the hours at its right end
  const boxes = await tiles.evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width) };
    }),
  );
  expect(new Set(boxes.map((b) => b.top)).size).toBe(count);
  expect(new Set(boxes.map((b) => b.left)).size).toBe(1);
  expect(new Set(boxes.map((b) => b.width)).size).toBe(1);
  const firstRow = tiles.first();
  const figure = await firstRow.locator("span.font-mono").boundingBox();
  const rowBox = await firstRow.boundingBox();
  expect((figure?.x ?? 0) + (figure?.width ?? 0)).toBeGreaterThan((rowBox?.x ?? 0) + (rowBox?.width ?? 0) - 40);
});
