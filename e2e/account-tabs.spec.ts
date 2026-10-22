import { expect, startFreshAccount, test } from "./helpers";

test("the Account page shows one section at a time, in tabs, and a link or reload keeps the tab", async ({ page }) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/account");
  const tabs = page.getByRole("tablist", { name: "Account sections" });
  const tab = (name: string) => tabs.getByRole("tab", { name, exact: true });

  await expect(tab("Your account")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Invoices", level: 2 })).toHaveCount(0); // not shown until its tab is open

  await tab("Your data").click();
  await expect(tab("Your data")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/#data$/);
  await expect(page.getByText("Download everything").first()).toBeVisible();
  await expect(page.getByText("Business details")).toHaveCount(0);

  await page.reload(); // the address keeps the tab
  await expect(tab("Your data")).toHaveAttribute("aria-selected", "true");

  await tab("Your data").press("ArrowRight"); // arrow keys move along the tabs
  await expect(tab("AI assistants")).toHaveAttribute("aria-selected", "true");
  await tab("Invoices").click();
  await expect(page.getByText("Business details").first()).toBeVisible();
});
