import { FEATURES } from "../src/lib/features";
import { expect, menuAction, startFreshAccount, test } from "./helpers";

test.skip(!FEATURES.clientCurrency, "A per-client currency is hidden in this release (src/lib/features.ts)");

/** Localisation step 2: one client is billed in its own currency while the account stays in dollars. */
test("a client can be billed in euros while the account is in dollars, until it has an invoice", async ({ page }) => {
  await startFreshAccount(page, "Fernhill");

  await test.step("the client's billing details have a currency that starts as the account's", async () => {
    await page.goto("/dashboard/clients");
    await menuAction(page, "More actions for Fernhill", "Billing details");
    const select = page.getByLabel("Currency", { exact: true });
    await expect(select).toHaveValue("");
    await expect(select).toContainText("Same as my account (USD)");
    await select.selectOption("EUR");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Client updated.")).toBeVisible();
  });

  await test.step("its rates are shown and typed in euros", async () => {
    await page.getByRole("button", { name: "Edit General" }).click();
    await expect(page.getByText(/€\d+\/h/).first()).toBeVisible(); // the symbol beside the rate
    await page.getByLabel("Rate per hour").fill("85");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("€85.00/h").first()).toBeVisible();
    await expect(page.getByText("$85.00/h")).toHaveCount(0);
  });

  await test.step("its invoice is in euros and the invoice list says so", async () => {
    await page.goto("/dashboard/today");
    await page.getByPlaceholder(/Time:/).fill("2h");
    await page.getByRole("button", { name: /Log time/ }).click();
    await expect(page.getByText("2:00", { exact: true }).locator("visible=true").first()).toBeVisible();
    await page.goto("/dashboard/invoices/new");
    await expect(page.getByText("€170.00").first()).toBeVisible(); // the preview already speaks euros
    await page.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByText("€170.00").first()).toBeVisible();
    await expect(page.getByText("$170.00")).toHaveCount(0);
  });

  await test.step("the client's currency is then fixed", async () => {
    await page.goto("/dashboard/clients");
    await menuAction(page, "More actions for Fernhill", "Billing details");
    const select = page.getByLabel("Currency", { exact: true });
    await expect(select).toBeDisabled();
    await expect(page.getByText(/Fixed, because you have made an invoice for this client/)).toBeVisible();
  });
});
