import { expect, test } from "@playwright/test";

test("on a phone the week's project rows are plain rows: name and client on the left, hours on the right", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone", "the pills are rows only on a phone");
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/dashboard/week");

  const rows = page.getByRole("region", { name: "This week" }).getByRole("button");
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  const width = page.viewportSize()?.width ?? 412;
  for (let i = 0; i < count; i++) {
    const box = await rows.nth(i).boundingBox();
    expect(box?.height ?? 999, `row ${i} is two lines at most`).toBeLessThan(64);
    expect(box?.width ?? 0, `row ${i} fills the width`).toBeGreaterThan(width * 0.7);
    // the hours are at the right end of the row
    const hours = await rows.nth(i).locator("span.font-mono").boundingBox();
    expect((hours?.x ?? 0) + (hours?.width ?? 0), `row ${i} hours on the right`).toBeGreaterThan(
      (box?.x ?? 0) + (box?.width ?? 0) - 24,
    );
  }
});
