import { expect, startFreshAccount, test } from "./helpers";

test("tapping a time chip again adds its time again; typing or another chip starts over", async ({ page }) => {
  await startFreshAccount(page);
  const time = page.getByLabel("Time to add");
  const chip = (name: string) => page.getByRole("button", { name, exact: true });

  await chip("2 hours").click();
  await expect(time).toHaveValue("120m");
  await chip("2 hours").click();
  await expect(time).toHaveValue("240m"); // 2 hours, again = 4 hours
  await chip("2 hours").click();
  await expect(time).toHaveValue("360m");

  await chip("30 min").click(); // another chip starts over
  await expect(time).toHaveValue("30m");
  await chip("30 min").click();
  await expect(time).toHaveValue("60m");

  await time.fill("1:30"); // typing starts over: the chip fills, it does not add to what was typed
  await chip("1 hour").click();
  await expect(time).toHaveValue("60m");
  await chip("1 hour").click();
  await expect(time).toHaveValue("120m");

  // the doubled time is what is saved
  await page.getByRole("button", { name: /^Add to the day/ }).click();
  await expect(page.getByRole("heading", { level: 1 }).locator("xpath=..")).toContainText("2:00 this day");
});
