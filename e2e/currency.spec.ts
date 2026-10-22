import { expect, startFreshAccount, test } from "./helpers";

/** Localisation step 1: a freelancer picks a currency once, and rates, invoices and totals follow it. */
test("choosing euros on Account changes how rates and invoices are written, and an invoice then locks it", async ({
  page,
}) => {
  await startFreshAccount(page);

  await test.step("the account starts in US dollars, and changing it is allowed before any invoice", async () => {
    await page.goto("/dashboard/account");
    const select = page.getByLabel("Currency", { exact: true });
    await expect(select).toHaveValue("USD");
    await expect(select).toBeEnabled();
    await select.selectOption("EUR");
    await expect(page.getByText(/Amounts are now written like €1,234\.56/)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Currency", { exact: true })).toHaveValue("EUR"); // it follows the account
  });

  await test.step("a rate is shown and typed in euros", async () => {
    await page.goto("/dashboard/clients");
    await page.getByRole("button", { name: "Edit General" }).click();
    await expect(page.getByLabel("Rate per hour").locator("..")).toContainText("€"); // the symbol beside the rate box
    await page.getByLabel("Rate per hour").fill("85");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("€85.00/h")).toBeVisible();
    await expect(page.getByText("$85.00/h")).toHaveCount(0);
  });

  await test.step("an invoice is made in euros, and then the currency can no longer be changed", async () => {
    await page.goto("/dashboard/today");
    await page.getByPlaceholder(/Time:/).fill("2h");
    await page.getByRole("button", { name: /Add to the day/ }).click();
    await expect(page.getByText("2:00", { exact: true }).locator("visible=true").first()).toBeVisible();
    await page.goto("/dashboard/invoices/new");
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByText("€170.00").first()).toBeVisible(); // 2 hours at €85

    await page.goto("/dashboard/account");
    const select = page.getByLabel("Currency", { exact: true });
    await expect(select).toBeDisabled();
    await expect(page.getByText(/fixed because you have made an invoice/)).toBeVisible();
  });
});
