import { expect, startFreshAccount, test } from "./helpers";

/**
 * The main navigation is down the left on a wide screen by default (2026-10-20): using the side menu, collapsing it to
 * icons, keeping both choices across a reload, switching to the tab strip along the top in the settings gear and back,
 * and phones keeping their bottom bar.
 */
test("navigation can sit down the left, collapse to icons, and survives a reload", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await startFreshAccount(page);
  const top = page.getByRole("navigation", { name: "Main pages" });
  const side = page.getByRole("navigation", { name: "Side menu" });

  // Every journey starts with the tab strip saved as the choice (see helpers.ts); here nothing is chosen, to see the real default.
  await page.context().clearCookies({ name: "nav_position" });
  await page.reload();

  if (phone) {
    await test.step("a phone has no choice to make: by default, and with Left saved, it keeps its bottom bar", async () => {
      await expect(top).toBeVisible();
      await expect(side).toBeHidden();
      await page.context().addCookies([{ name: "nav_position", value: "left", url: page.url() }]);
      await page.reload();
      await expect(top).toBeVisible();
      await expect(side).toBeHidden();
    });
    return;
  }

  await test.step("by default, on a wide screen, the side menu is shown and the tab strip is not", async () => {
    await expect(page.locator("html")).toHaveAttribute("data-nav-position", "left");
    await expect(side).toBeVisible();
    await expect(top).toBeHidden();
    for (const name of [
      "Today",
      "Week",
      "Month",
      "Invoices",
      "Clients & Projects",
      "Year summary (taxes)",
      "Team",
      "Account",
      "Guide",
    ]) {
      await expect(side.getByRole("link", { name })).toBeVisible();
    }
    for (const heading of ["Track", "Bill", "Manage", "Settings"])
      await expect(side.getByText(heading, { exact: true })).toBeVisible();
    await expect(side.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  });

  await test.step("a link in the side menu goes to its page and becomes the current one", async () => {
    await side.getByRole("link", { name: "Week" }).click();
    await expect(page).toHaveURL(/dashboard\/week/);
    await expect(side.getByRole("link", { name: "Week" })).toHaveAttribute("aria-current", "page");
    await expect(side.getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current", "page");
  });

  await test.step("collapse to icons only: the words are hidden but the links keep their names", async () => {
    const before = (await side.boundingBox())?.width ?? 0;
    await side.getByRole("button", { name: "Collapse menu" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-nav-collapsed", "collapsed");
    await expect.poll(async () => (await side.boundingBox())?.width ?? 999).toBeLessThan(before / 2);
    await expect(side.getByRole("link", { name: "Month" })).toBeVisible(); // still has its name for a screen reader
  });

  await test.step("double-clicking empty space in the menu unfolds it, and again folds it (links and buttons are not affected)", async () => {
    // empty space: between the last link and the Log out button
    const lastLink = (await side.getByRole("link", { name: "Guide" }).boundingBox()) ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
    const logOut = (await side.getByRole("button", { name: "Log out" }).boundingBox()) ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
    const box = (await side.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    const gapY = (lastLink.y + lastLink.height + logOut.y) / 2;
    const empty = { x: box.x + box.width / 2, y: gapY };
    await page.mouse.dblclick(empty.x, empty.y);
    await expect(page.locator("html")).toHaveAttribute("data-nav-collapsed", "open");
    await page.mouse.dblclick(box.x + 120, gapY);
    await expect(page.locator("html")).toHaveAttribute("data-nav-collapsed", "collapsed");
    await side.getByRole("link", { name: "Month" }).dblclick(); // goes to Month, does not toggle
    await expect(page).toHaveURL(/dashboard\/month/);
    await expect(page.locator("html")).toHaveAttribute("data-nav-collapsed", "collapsed");
  });

  await test.step("the page card still fits beside the menu without sideways scrolling", async () => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  await test.step("both choices survive a reload and are applied on the first paint", async () => {
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-nav-position", "left");
    await expect(page.locator("html")).toHaveAttribute("data-nav-collapsed", "collapsed");
    await expect(side).toBeVisible();
    await expect(top).toBeHidden();
  });

  await test.step("switching to Top puts the tab strip back, and that choice survives a reload", async () => {
    await page.getByRole("button", { name: "Appearance and layout settings" }).click();
    await page.getByRole("radio", { name: "Navigation along the top" }).click();
    await page.keyboard.press("Escape");
    await expect(top).toBeVisible();
    await expect(side).toBeHidden();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-nav-position", "top");
    await expect(top).toBeVisible();
  });

  await test.step("choosing Left again in the settings brings the side menu back", async () => {
    await page.getByRole("button", { name: "Appearance and layout settings" }).click();
    await page.getByRole("radio", { name: "Navigation down the left" }).click();
    await page.keyboard.press("Escape");
    await expect(side).toBeVisible();
    await expect(top).toBeHidden();
  });
});
