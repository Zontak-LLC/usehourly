import { expect, test } from "./helpers";

/** "See it working": the screens are a deck pinned on the page; scrolling flips them, and a caption jumps to its screen. */
test.describe("landing screens deck", () => {
  test("scrolling flips to the next screen, and a caption jumps to its screen", async ({ page, isMobile }) => {
    test.skip(isMobile, "the caption list is for wide screens; a phone shows one caption that follows the scroll");
    await page.goto("/");
    const section = page.locator("#see-it");
    await section.scrollIntoViewIfNeeded();
    const list = page.getByRole("list", { name: "Screens of the app" });
    await expect(list.getByRole("button", { name: /Log a day in seconds/ })).toHaveAttribute("aria-current", "step", {
      timeout: 15_000,
    });

    // Scroll a little way into the tall track: the second screen comes to the front. A busy machine can drop the
    // first scroll event, so the scroll is repeated until the screen flips.
    await expect(async () => {
      await page.evaluate(() => {
        const el = document.querySelector("#see-it [style*='height']") as HTMLElement;
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + window.innerHeight * 0.9);
      });
      await expect(list.getByRole("button", { name: /whole week at a glance/ })).toHaveAttribute(
        "aria-current",
        "step",
        { timeout: 3_000 },
      );
    }).toPass({ timeout: 30_000 });
    await expect(page.getByRole("img", { name: /The Week screen of UseHourly/ }).first()).toBeVisible();

    // A caption scrolls to its own screen.
    await expect(async () => {
      await list.getByRole("button", { name: /Ready for tax time/ }).click();
      await expect(list.getByRole("button", { name: /Ready for tax time/ })).toHaveAttribute("aria-current", "step", {
        timeout: 3_000,
      });
    }).toPass({ timeout: 30_000 });
  });
});
