import { expect, startFreshAccount, test } from "./helpers";

// Adding time is a small reward (2026-10-23): a chip sends a "+2h" token into the field, the value rolls up and the
// field glows in the chip's colour. It is decoration only: the value is set at once, so nothing waits for it.
test("time field: a chip's token flies in, the value is ready at once, and there is no clear button", async ({
  page,
}) => {
  await startFreshAccount(page);
  const time = page.getByLabel("Time to add");
  const chip = (name: string) => page.getByRole("button", { name, exact: true });
  const clear = page.getByRole("button", { name: "Clear time" });

  await test.step("a chip sends its token into the field and the value is there at once", async () => {
    await chip("2 hours").click();
    await expect(page.getByText("+2h", { exact: true })).toBeAttached(); // the flying token
    await expect(time).toHaveValue("2h");
    await expect(page.getByText("+2h", { exact: true })).toHaveCount(0); // it lands and goes
  });

  await test.step("no round × to clear the field, even with a value in it (2026-10-24, the owner)", async () => {
    await expect(clear).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Clear/ })).toHaveCount(0);
    await time.fill("");
  });

  await test.step("Enter in the middle of the roll saves the final value", async () => {
    await chip("2 hours").click();
    await chip("2 hours").click();
    await time.press("Enter");
    await expect(page.getByRole("navigation", { name: "Days" })).toContainText("4:00 this day");
    await expect(time).toHaveValue("");
  });
});

test("with reduced motion the chip sets the value and nothing flies", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startFreshAccount(page);
  await page.getByRole("button", { name: "1 hour", exact: true }).click();
  await expect(page.getByLabel("Time to add")).toHaveValue("1h");
  await expect(page.getByText("+1h", { exact: true })).toHaveCount(0);
});
