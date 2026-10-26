import { expect, startFreshAccount, test } from "./helpers";

// Every chip adds its time to what is in the box (2026-10-25): the same chip again, another chip, or after typing.
test("every time chip adds its time to what is in the box, also after typing", async ({ page }) => {
  await startFreshAccount(page);
  const time = page.getByLabel("Time to add");
  const chip = (name: string) => page.getByRole("button", { name, exact: true });

  await chip("2 hours").click();
  await expect(time).toHaveValue("2h");
  await chip("2 hours").click();
  await expect(time).toHaveValue("4h"); // 2 hours, again = 4 hours

  await chip("30 min").click(); // another chip adds too
  await expect(time).toHaveValue("4h30");

  await time.fill("1:30"); // after typing, a chip adds to the typed time
  await chip("1 hour").click();
  await expect(time).toHaveValue("2h30");

  // the added-up time is what is saved
  await page.getByRole("button", { name: /^Log time/ }).click();
  await expect(page.getByRole("navigation", { name: "Days" })).toContainText("2:30 this day");
});
