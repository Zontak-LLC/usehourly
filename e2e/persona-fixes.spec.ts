import { expect, startFreshAccount, test } from "./helpers";

/** Found by the persona walkthrough (ticket #179): three things that tripped a first-time freelancer. */

test("a project with no rate has an empty rate box with a hint, so typing 95 makes $95 and not $0.0095", async ({
  page,
}) => {
  await startFreshAccount(page, "Northwind Studio");
  await page.goto("/dashboard/clients");
  await page.getByRole("button", { name: /^Edit General$/ }).click();
  const rate = page.getByLabel("Rate per hour");
  await expect(rate).toHaveValue(""); // not a real "0.00" that typing would land inside
  await expect(rate).toHaveAttribute("placeholder", "0.00");
  await rate.click();
  await page.keyboard.type("95");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("$95.00/h")).toBeVisible();

  // with a rate set, a click selects it, so typing replaces it
  await page.getByRole("button", { name: /^Edit General$/ }).click();
  await expect(rate).toHaveValue("95.00");
  await rate.click();
  await page.keyboard.type("100");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("$100.00/h")).toBeVisible();
});

test("picking the first day in Add to several days does not make the calendar jump", async ({ page }) => {
  await startFreshAccount(page, "Acme");
  await page.goto("/dashboard/month");
  await page.getByRole("button", { name: "Add to several days" }).click();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const day = page.getByRole("button", { name: new RegExp(`^${thisMonth}-10`) });
  // where the day sits on the whole page (not on the screen: the page may scroll to the clicked day)
  const top = () => day.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const before = await top();
  await day.click();
  await expect(page.getByText("1 day selected")).toBeVisible();
  expect(Math.abs((await top()) - before)).toBeLessThan(2);
});
