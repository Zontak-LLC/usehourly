import { expect, test } from "./helpers";

/**
 * "See it working": the real screens as a deck you flip through with the tabs, the arrows, the dots or the arrow keys
 * (2026-10-23: it used to flip only by scrolling a tall pinned track, which was hard on a desktop).
 */
test("the screens deck flips with the tabs, the arrows, the dots and the arrow keys", async ({ page, isMobile }) => {
  await page.goto("/");
  const deck = page.getByRole("region", { name: "Screens of the app" });
  await deck.scrollIntoViewIfNeeded();
  const tab = (name: string) => deck.getByRole("tab", { name, exact: true });
  const shows = (title: string) => expect(deck.getByRole("heading", { name: title })).toBeVisible();

  await expect(tab("Today")).toHaveAttribute("aria-selected", "true");
  await shows("Log a day in seconds");

  await tab("Invoices").click();
  await expect(tab("Invoices")).toHaveAttribute("aria-selected", "true");
  await shows("Paid, waiting, late");
  await expect(page.getByRole("img", { name: /The Invoices screen of UseHourly/ }).first()).toBeVisible();

  await deck.getByRole("button", { name: "Show the Week screen" }).click(); // a dot
  await shows("The whole week at a glance");

  if (!isMobile) {
    await deck.getByRole("button", { name: "Next screen" }).click();
    await shows("A calendar of what you did");
    await deck.getByRole("button", { name: "Previous screen" }).click();
    await deck.getByRole("button", { name: "Previous screen" }).click();
    await shows("Log a day in seconds");
    await deck.getByRole("button", { name: "Previous screen" }).click(); // wraps round to the last
    await shows("Ready for tax time");

    await tab("Year summary").focus();
    await page.keyboard.press("ArrowRight"); // and back to the first
    await shows("Log a day in seconds");
  }
});

/**
 * Issue 221: the home page shows only what ships, once. The "From hours to paid" story repeated the deck and the
 * feature tiles, so it was removed; the deck pictures fill their window (no shrunk full page with an empty foot).
 */
test("the home page has no repeated story, and the deck picture fills its window", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "See it working." })).toBeVisible();
  await expect(page.getByRole("heading", { name: /From hours to paid/ })).toHaveCount(0);
  // The app draws no clocks: no "Quick entry and a stopwatch" tile and no REC chip.
  await expect(page.getByText(/Quick entry and a stopwatch/i)).toHaveCount(0);
  await expect(page.getByText("REC", { exact: true })).toHaveCount(0);

  const deck = page.getByRole("region", { name: "Screens of the app" });
  await deck.scrollIntoViewIfNeeded();
  const img = page.getByRole("img", { name: /The Today screen of UseHourly/ });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  const fit = await img.evaluate((el: HTMLImageElement) => {
    const box = el.getBoundingClientRect();
    return { picture: el.naturalWidth / el.naturalHeight, box: box.width / box.height };
  });
  // On a computer the picture and its frame share a shape, so object-cover crops nothing. A phone has its own picture.
  if (!isMobile) expect(Math.abs(fit.picture - fit.box)).toBeLessThan(0.12);
});
