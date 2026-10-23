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
