import { expect, startDemo, test } from "./helpers";

test("the year summary hides empty months until asked, writes empties as dashes, and is compact on a phone", async ({
  page,
}, info) => {
  await startDemo(page);
  await page.goto("/dashboard/report#months");

  const months = page.getByRole("region", { name: "By month" });
  await expect(months).toBeVisible();
  const visibleRows = () =>
    info.project.name === "phone" ? months.locator("ul.sm\\:hidden > li") : months.locator("tbody tr");

  // The sample data only has recent months: the rest are hidden behind a button.
  const folded = await visibleRows().count();
  expect(folded).toBeLessThan(12);
  const showAll = months.getByRole("button", { name: /^Show all 12 months/ });
  await expect(showAll).toBeVisible();
  await showAll.click();
  await expect(visibleRows()).toHaveCount(info.project.name === "phone" ? 13 : 12); // a phone also lists the Total row
  await months.getByRole("button", { name: "Show only months with activity" }).click();
  await expect(visibleRows()).toHaveCount(folded);

  // an empty figure is a dash everywhere, never "0.00 h" in one table and "–" in another
  await page.goto("/dashboard/report#quarters");
  const quarters = page.getByRole("region", { name: "By quarter" });
  await expect(quarters).toBeVisible();
  await expect(quarters).not.toContainText("0.00 h");
  await expect(quarters).not.toContainText("$0.00");

  if (info.project.name === "phone") {
    await page.goto("/dashboard/report#months");
    // two lines per row on a phone: the month and what it earned, the rest in one muted line (no "Hours / Billable" label lists)
    await expect(months.getByText("Billable", { exact: true }).locator("visible=true")).toHaveCount(0);
    await expect(months.locator("ul.sm\\:hidden > li").first().locator("p").nth(1)).toContainText("worked");
  }
});

test("?year= opens that year (the emailed summary's button), and a year in the future falls back to this one", async ({
  page,
}) => {
  await startDemo(page);
  const thisYear = new Date().getFullYear();
  await page.goto(`/dashboard/report?year=${thisYear - 1}`);
  await expect(page.getByRole("heading", { name: `Year summary · ${thisYear - 1}` })).toBeVisible();
  await page.goto(`/dashboard/report?year=${thisYear + 5}`);
  await expect(page.getByRole("heading", { name: `Year summary · ${thisYear}` })).toBeVisible();
});

test("rendered in the browser only, the page keeps its tab title and passes the page checks", async ({
  page,
  audit,
  a11y,
}) => {
  await startDemo(page);
  await page.goto("/dashboard/report");
  await expect(page.getByRole("heading", { level: 1, name: /^Year summary · \d{4}$/ })).toBeVisible();
  await expect(page).toHaveTitle("Year summary · UseHourly");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await audit("year-summary");
  await a11y("year-summary");
});
