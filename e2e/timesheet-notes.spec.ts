import { anonymous, expect, startFreshAccount, test } from "./helpers";

test("the client's timesheet lists what was worked on as a table: date once per day, project, work, hours", async ({
  page,
  browser,
}, info) => {
  await startFreshAccount(page, "Acme");
  for (const [time, note] of [
    ["1h", "Wrote the homepage copy"],
    ["2h", "Built the pricing page"],
  ]) {
    await page.getByLabel("Time to add").fill(time);
    await page.getByLabel("Description").fill(note);
    await page.getByRole("button", { name: /^Add to the day/ }).click();
    await expect(page.getByText(note)).toBeVisible();
  }
  await page.goto("/dashboard/month");
  await page.getByRole("button", { name: "Share & export" }).click();
  await page.getByRole("menuitem", { name: /Send to a client for sign-off/ }).click();
  await page.getByRole("button", { name: "Make a link" }).click();
  const link = await page.getByLabel("Timesheet link").inputValue();

  const client = await anonymous(browser, info);
  const reader = await client.newPage();
  await reader.goto(link);
  const table = reader.getByRole("region", { name: "What was worked on" });
  await expect(table.getByRole("listitem")).toHaveCount(2);
  await expect(table.getByText("Wrote the homepage copy")).toBeVisible();
  await expect(table.getByText("Built the pricing page")).toBeVisible();
  await expect(table.getByText("1:00", { exact: true })).toBeVisible(); // the hours have their own column
  await expect(table.getByText("2:00", { exact: true })).toBeVisible();
  // the day is written once: the second row of the same day leaves it blank (hidden), so exactly one is visible
  const day = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  await expect(table.getByText(day, { exact: true }).locator("visible=true")).toHaveCount(1);
  await reader.screenshot({ path: `e2e/report/screens/${info.project.name}/timesheet-notes.png`, fullPage: true });
  await client.close();
});
