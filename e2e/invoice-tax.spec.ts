import { FEATURES } from "../src/lib/features";
import { expect, gotoClient, startFreshAccount, test } from "./helpers";

test.skip(!FEATURES.invoiceTax, "Tax on invoices is hidden in this release (src/lib/features.ts)");

/** Localisation step 4 (issue #71): VAT set once on Account is added to each new invoice, unless left off that one. */
test("a freelancer who charges VAT sets it once, and invoices add it on top and print the VAT number", async ({
  page,
}) => {
  await startFreshAccount(page, "Northwind");

  await test.step("the Tax card on Account takes a name, a rate and a tax number", async () => {
    await page.goto("/dashboard/account#invoices");
    await page.getByRole("button", { name: "VAT", exact: true }).click();
    await expect(page.getByLabel("Name of the tax")).toHaveValue("VAT");
    const rate = page.getByLabel("Rate (%)");
    await rate.fill("twenty");
    await expect(page.getByText("Type the rate as a percentage, e.g. 20 or 7.5.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save tax" })).toBeDisabled();
    await rate.fill("20");
    await expect(page.getByText("On $1,000.00 of work: VAT $200.00, total $1,200.00.")).toBeVisible();
    await page.getByLabel("Your tax number").fill("GB123456789");
    await page.getByRole("button", { name: "Save tax" }).click();
    await expect(page.getByText("New invoices add VAT at 20%.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Rate (%)")).toHaveValue("20"); // it follows the account
    await expect(page.getByLabel("Your tax number")).toHaveValue("GB123456789");
  });

  await test.step("two hours at $100 an hour", async () => {
    await gotoClient(page, "Northwind"); // on a phone the list comes first
    await page.getByRole("button", { name: "Edit General" }).click();
    await page.getByLabel("Rate per hour").fill("100");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("$100.00/h").first()).toBeVisible();
    await page.goto("/dashboard/today");
    await page.getByPlaceholder(/Time:/).fill("2h");
    await page.getByRole("button", { name: /Log time/ }).click();
    await expect(page.getByText("2:00", { exact: true }).locator("visible=true").first()).toBeVisible();
  });

  await test.step("the builder adds VAT on top, and it can be left off this one invoice", async () => {
    await page.goto("/dashboard/invoices/new");
    const add = page.getByLabel("Add VAT (20%)");
    await expect(add).toBeChecked();
    await expect(page.getByRole("row", { name: /Subtotal/ })).toContainText("$200.00");
    await expect(page.getByRole("row", { name: /VAT \(20%\)/ })).toContainText("$40.00");
    await expect(page.getByRole("row", { name: /^Total/ })).toContainText("$240.00");
    await add.uncheck();
    await expect(page.getByRole("row", { name: /Subtotal/ })).toHaveCount(0);
    await expect(page.getByRole("row", { name: /^Total/ })).toContainText("$200.00");
    await add.check();
    await expect(page.getByRole("row", { name: /^Total/ })).toContainText("$240.00");
  });

  await test.step("the saved invoice owes the total with VAT and prints the VAT number", async () => {
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices$/);
    await expect(page.getByText("$240.00").first()).toBeVisible();
    await page
      .getByRole("link", { name: /: open the invoice$/ })
      .first()
      .click();
    await expect(page.getByText("VAT number GB123456789")).toBeVisible();
    await expect(page.getByRole("row", { name: /VAT \(20%\)/ })).toContainText("$40.00");
    await expect(page.getByRole("row", { name: /^Total/ })).toContainText("$240.00");
  });
});
