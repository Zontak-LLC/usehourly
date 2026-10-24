import type { Locator, Page } from "@playwright/test";

import { expect, signUpByApi, test } from "./helpers";

/**
 * Deleting the account is a slide, not a button (issue 210). The password box is still the check that stops someone at
 * an unlocked laptop: the slider stays off until it is filled. A short drag springs back and deletes nothing; Enter in
 * the box never deletes; a drag all the way across deletes the account and signs out.
 */

/** Drags the slider's knob with the mouse to `fraction` of the track's width (0 to 1), then lets go. */
async function drag(page: Page, slider: Locator, fraction: number) {
  // Centred first: on a phone the floating tab bar covers the foot of the screen, where scrolling into view leaves it.
  await slider.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const knob = await slider.boundingBox();
  const track = await slider.locator("..").boundingBox();
  if (!knob || !track) throw new Error("the slider is not on screen");
  const y = knob.y + knob.height / 2;
  await page.mouse.move(knob.x + knob.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * fraction, y, { steps: 12 });
  await page.mouse.up();
}

test("slide to delete: off until the password is typed, a short drag springs back, a full one deletes", async ({
  page,
}) => {
  const user = await signUpByApi(page);
  await page.goto("/dashboard/account#account");
  await page.getByRole("button", { name: /Delete my account/ }).click();

  // There is no delete button any more: the slider is the only way.
  await expect(page.getByRole("button", { name: /Delete everything/ })).toHaveCount(0);
  const slider = page.getByRole("slider", { name: "Slide to delete your account" });
  await slider.scrollIntoViewIfNeeded();

  await test.step("off until the password is typed", async () => {
    await expect(slider).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Type your password above first.")).toBeVisible();
    await drag(page, slider, 1);
    await page.waitForTimeout(500); // a wrongly started delete would navigate away meanwhile
    await expect(page).toHaveURL(/\/dashboard\/account/);
    await expect(slider).toHaveAttribute("aria-valuenow", "0");
  });

  const box = page.getByLabel(/Type your password/);
  await box.fill(user.password);
  await expect(slider).not.toHaveAttribute("aria-disabled", "true");

  await test.step("Enter in the box only moves to the slider", async () => {
    await box.press("Enter");
    await expect(slider).toBeFocused();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/dashboard\/account/);
  });

  await test.step("the keyboard moves the knob step by step; leaving puts it back", async () => {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "20");
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "0");
    await page.keyboard.press("ArrowRight");
    await box.focus(); // leaving the slider before the end springs it back
    await expect(slider).toHaveAttribute("aria-valuenow", "0");
  });

  await test.step("a short drag springs back and deletes nothing", async () => {
    await drag(page, slider, 0.55);
    await expect(slider).toHaveAttribute("aria-valuenow", "0");
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/dashboard\/account/);
    // The account is still there: its page still loads for this person.
    await page.reload();
    await expect(page.getByRole("button", { name: /Delete my account/ })).toBeVisible();
  });

  await test.step("a drag all the way across deletes the account and signs out", async () => {
    await page.getByRole("button", { name: /Delete my account/ }).click();
    await page.getByLabel(/Type your password/).fill(user.password);
    await slider.scrollIntoViewIfNeeded();
    await drag(page, slider, 1);
    await expect(page).toHaveURL(/\/account-deleted$/);
    await expect(page.getByRole("heading", { name: "Your account is deleted" })).toBeVisible();
    // Signed out, and the account is gone: the dashboard sends the visitor to log in.
    await page.goto("/dashboard/today");
    await expect(page).toHaveURL(/\/auth\/v2\/login/);
  });
});
