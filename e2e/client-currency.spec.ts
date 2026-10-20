import { expect, startFreshAccount, test } from "./helpers";

/** Localisation step 2: one client is billed in its own currency while the account stays in dollars. */
test("a client can be billed in euros while the account is in dollars, until it has an invoice", async ({ page }) => {
  await startFreshAccount(page, "Fernhill");

  await test.step("the client's billing details have a currency that starts as the account's", async () => {
    await page.goto("/dashboard/clients");
    await page.getByRole("button", { name: "Edit Fernhill billing details" }).click();
    const select = page.getByLabel("Currency", { exact: true });
    await expect(select).toHaveValue("");
    await expect(select).toContainText("Same as my account (USD)");
    await select.selectOption("EUR");
    await page.getByRole("button", { name: "Save client" }).click();
    await expect(page.getByText("Client updated.")).toBeVisible();
  });

  await test.step("its rates are shown and typed in euros", async () => {
    await page.getByRole("button", { name: "Edit General" }).click();
    await expect(page.getByLabel("Rate per hour").locator("..")).toContainText("€");
    await page.getByLabel("Rate per hour").fill("85");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("€85.00/h")).toBeVisible();
    await expect(page.getByText("$85.00/h")).toHaveCount(0);
  });

  await test.step("its invoice is in euros and the invoice list says so", async () => {
    await page.goto("/dashboard/today");
    await page.getByPlaceholder(/Time:/).fill("2h");
    await page.getByRole("button", { name: /Add to the day/ }).click();
    await expect(page.getByText("2:00").first()).toBeVisible();
    await page.goto("/dashboard/invoices/new");
    await expect(page.getByText("€170.00").first()).toBeVisible(); // the preview already speaks euros
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByText("€170.00").first()).toBeVisible();
    await expect(page.getByText("$170.00")).toHaveCount(0);
  });

  await test.step("the client's currency is then fixed", async () => {
    await page.goto("/dashboard/clients");
    await page.getByRole("button", { name: "Edit Fernhill billing details" }).click();
    const select = page.getByLabel("Currency", { exact: true });
    await expect(select).toBeDisabled();
    await expect(page.getByText(/Fixed, because you have made an invoice for this client/)).toBeVisible();
  });
});
