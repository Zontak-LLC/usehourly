import { expect, test } from "@playwright/test";

test("the year summary hides empty months until asked, writes empties as dashes, and is compact on a phone", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/dashboard/report");

  const months = page.getByRole("region", { name: "By month" });
  await expect(months).toBeVisible();
  const visibleRows = () =>
    info.project.name === "phone" ? months.locator("ul.sm\\:hidden > li") : months.locator("tbody tr");

  // The sample data only has recent months: the rest are folded away behind a button.
  const folded = await visibleRows().count();
  expect(folded).toBeLessThan(12);
  const showAll = months.getByRole("button", { name: /^Show all 12 months/ });
  await expect(showAll).toBeVisible();
  await showAll.click();
  await expect(visibleRows()).toHaveCount(info.project.name === "phone" ? 13 : 12); // a phone also lists the Total row
  await months.getByRole("button", { name: "Show only months with activity" }).click();
  await expect(visibleRows()).toHaveCount(folded);

  // an empty figure is a dash everywhere, never "0.00 h" in one table and "–" in another
  const quarters = page.getByRole("region", { name: "By quarter" });
  await expect(quarters).not.toContainText("0.00 h");
  await expect(quarters).not.toContainText("$0.00");

  if (info.project.name === "phone") {
    // two lines per row on a phone: the month and what it earned, the rest in one muted line (no "Hours / Billable" label lists)
    await expect(months.getByText("Billable", { exact: true }).locator("visible=true")).toHaveCount(0);
    await expect(months.locator("ul.sm\\:hidden > li").first().locator("p").nth(1)).toContainText("worked");
  }
});
