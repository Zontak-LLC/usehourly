import { expect, test } from "@playwright/test";

import { startDemo } from "./helpers";

test("on a sample account the sign-up card is one line and a button until you want it", async ({ page }) => {
  await startDemo(page);
  await page.goto("/dashboard/account#account");

  const card = page.locator("#claim");
  await expect(card).toContainText("Keep your work: create a free account");
  await expect(card.getByLabel("Email")).toBeHidden(); // no form yet
  await expect(card.getByRole("button", { name: "Create my account" }).locator("visible=true")).toHaveCount(1);

  await card.getByRole("button", { name: "Create my account" }).locator("visible=true").click();
  await expect(card.getByLabel("Email")).toBeVisible();
  await expect(card.getByLabel("Password")).toBeVisible();
  await card.getByRole("button", { name: "Not now" }).click();
  await expect(card.getByLabel("Email")).toBeHidden();

  // the demo banner's link opens it straight away
  await page.goto("/dashboard/account#claim");
  await expect(page.locator("#claim").getByLabel("Email")).toBeVisible();
});
