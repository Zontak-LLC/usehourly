import { expect, startFreshAccount, test } from "./helpers";

// Money right (issue #178, 2026-10-23): a client shows what is not invoiced yet, Make invoice bills exactly that, and
// the same hours are never billed twice without asking.
test("not invoiced yet, make the invoice, and the same time is not billed twice", async ({ page }) => {
  await startFreshAccount(page, "Acme");

  await test.step("a rate and two hours of work", async () => {
    await page.goto("/dashboard/clients");
    await page.getByRole("button", { name: "Edit General" }).click();
    await page.getByLabel("Rate per hour").fill("100");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("$100.00/h")).toBeVisible();
    await page.goto("/dashboard/today");
    await page.getByLabel("Time to add").fill("2h");
    await page.getByRole("button", { name: /^Log time/ }).click();
    await expect(page.getByRole("heading", { level: 1 }).locator("xpath=..")).toContainText("2:00 this day");
  });

  const card = page.getByRole("region", { name: "Acme" });
  await test.step("the client shows what is not invoiced yet, with Make invoice", async () => {
    await page.goto("/dashboard/clients");
    await expect(card).toContainText("$200.00 not invoiced yet");
    await card.getByRole("link", { name: "Make an invoice for Acme" }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices\/new\?client=/);
    await expect(page.getByText("$200.00").first()).toBeVisible();
    await page.getByRole("button", { name: /Create invoice/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices$/);
  });

  await test.step("once invoiced, nothing is left to bill and the entry says so", async () => {
    await page.goto("/dashboard/clients");
    await expect(card.getByRole("heading", { name: "Acme" })).toBeVisible();
    await expect(card).not.toContainText("not invoiced yet");
    await expect(card.getByRole("link", { name: "Make an invoice for Acme" })).toHaveCount(0);
    await page.goto("/dashboard/today");
    await expect(page.getByText("Invoiced", { exact: true }).first()).toBeVisible();
  });

  await test.step("a new invoice for the same time warns, and bills it again only when asked", async () => {
    await page.goto("/dashboard/invoices/new");
    await expect(page.getByText(/2:00 of this client.s time in this period is already on an invoice/)).toBeVisible();
    const create = page.getByRole("button", { name: /Create invoice/ });
    await expect(create).toBeDisabled();
    await page.getByLabel("Bill it again anyway").check();
    await expect(page.getByText("$200.00").first()).toBeVisible();
    await expect(create).toBeEnabled();
  });
});
