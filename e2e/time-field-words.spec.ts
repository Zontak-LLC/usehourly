import { DURATION_NOT_POSITIVE, minutesHint } from "../src/lib/duration";
import { expect, startFreshAccount, test } from "./helpers";

/**
 * The time field says what it will log (issue 435, from a demo test). A bare number is hours ("2" is 2:00, not two
 * minutes), "1,5" works like "1.5", and a mistake gets plain words that go away on the next keystroke, never the raw
 * zod "Too small: expected number to be >=1".
 */
test("the time field shows = 2:00 as you type, reads 1,5, and refuses 0 and 25 in plain words", async ({ page }) => {
  await startFreshAccount(page, "Acme");
  const card = page.getByRole("region", { name: /^Log time/ });
  const time = card.getByLabel("Time to add");
  // A prefix, as in the other specs: on a wide screen the name ends in the Enter key hint ("Log time ↵").
  const log = card.getByRole("button", { name: /^Log time/ });
  const entries = page.getByRole("region", { name: "Today's entries" }).getByRole("listitem");
  await expect(time).toHaveAttribute("placeholder", "Time: 2, 1,5, 1:30 or 90m");

  await test.step("a bare 2 is two hours, shown before Log time is pressed", async () => {
    await time.fill("2");
    await expect(card.getByText("= 2:00 · Day total 0:00 → 2:00 h")).toBeVisible();
    await time.fill("13");
    await expect(card.getByText(/^= 13:00 · /)).toBeVisible();
    await time.fill("24");
    await expect(card.getByText(/^= 24:00 · /)).toBeVisible();
  });

  await test.step("1,5 is read as 1.5 and logs 1:30", async () => {
    await time.fill("1,5");
    await expect(card.getByText(/^= 1:30 · /)).toBeVisible();
    await time.press("Enter");
    await expect(entries).toHaveCount(1);
    await expect(entries.first()).toContainText("1:30");
  });

  await test.step("0 and -2 ask for more than 0, and one more key that makes a time clears it", async () => {
    const error = card.getByText(DURATION_NOT_POSITIVE);
    await time.fill("-2");
    await expect(error).toBeVisible();
    await time.fill("0");
    await expect(error).toBeVisible();
    await expect(time).toHaveAttribute("aria-invalid", "true");
    await time.press("1"); // "01": one hour
    await expect(error).toHaveCount(0);
    await expect(time).toHaveAttribute("aria-invalid", "false");
    await expect(card.getByText(/^= 1:00 · /)).toBeVisible();
  });

  await test.step("a bare 25 is not guessed: the field says how to type minutes and nothing is logged", async () => {
    await time.fill("25");
    await expect(card.getByText(minutesHint(25))).toBeVisible();
    await expect(log).toBeDisabled();
    await time.press("Enter");
    await expect(page.getByText(/Too small/)).toHaveCount(0);
    await expect(entries).toHaveCount(1);
  });

  await test.step("25m logs twenty-five minutes", async () => {
    await time.fill("25m");
    await expect(card.getByText(minutesHint(25))).toHaveCount(0);
    await expect(card.getByText(/^= 0:25 · /)).toBeVisible();
    await log.click();
    await expect(entries).toHaveCount(2);
    await expect(entries.filter({ hasText: "0:25" })).toHaveCount(1);
  });

  await test.step("abc still gets the old plain sentence", async () => {
    await time.fill("abc");
    await expect(card.getByText("Couldn't read that duration. Try 1.5, 1:30 or 90m.")).toBeVisible();
  });
});
