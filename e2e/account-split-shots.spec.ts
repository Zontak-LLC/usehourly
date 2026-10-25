import { expect, startFreshAccount, test } from "./helpers";
import { mkdirSync } from "node:fs";

/**
 * Not part of a normal run. Photographs every Account section at 1280x900 and 390x844, light and dark, for the split
 * view experiment (issue 283):
 *   ACCOUNT_SHOTS=before npx playwright test e2e/account-split-shots.spec.ts --project=desktop   (on the old code)
 *   ACCOUNT_SHOTS=after  npx playwright test e2e/account-split-shots.spec.ts --project=desktop
 * Pictures go to e2e/report/account-split/<label>-<section>-<width>-<mode>.png.
 */
const label = process.env.ACCOUNT_SHOTS;
test.skip(!label, "only when comparing the Account layouts");

const SECTIONS = ["list", "account", "invoices", "data", "ai"] as const;
const SIZES = [
  [1280, 900],
  [390, 844],
] as const;

test("photograph the Account sections", async ({ page }) => {
  test.setTimeout(240_000);
  const dir = "e2e/report/account-split";
  mkdirSync(dir, { recursive: true });
  await startFreshAccount(page, "Acme Studio");
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    for (const section of SECTIONS) {
      await page.goto(section === "list" ? "/dashboard/account" : `/dashboard/account#${section}`);
      await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      for (const mode of ["light", "dark"] as const) {
        await page.evaluate((m) => document.documentElement.classList.toggle("dark", m === "dark"), mode);
        await page.waitForTimeout(150); // the colour change after the theme switch fires no event to wait for
        await page.screenshot({
          path: `${dir}/${label}-${section}-${width}-${mode}.png`,
          caret: "initial",
        });
      }
    }
  }
});
