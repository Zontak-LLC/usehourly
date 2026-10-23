import { expect, test } from "./helpers";

// The logo on the sign-in pages goes to the home page (found 2026-10-23: the layer that centres the form sat on top of
// it and took the click).
test("the logo on the log-in page goes to the home page, and the theme switch can be clicked", async ({ page }) => {
  await page.goto("/auth/v2/login");
  await page.getByRole("link", { name: "UseHourly" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/auth/v2/register");
  await page.getByRole("link", { name: "UseHourly" }).click();
  await expect(page).toHaveURL(/\/$/);
});
