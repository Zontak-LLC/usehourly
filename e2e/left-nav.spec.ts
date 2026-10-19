import { expect, startFreshAccount, test } from "./helpers";

/**
 * The choice of having the main navigation down the left on a wide screen: switching it in the settings gear, using the
 * side menu, collapsing it to icons, keeping both choices across a reload, and phones keeping their bottom bar.
 */
test("navigation can sit down the left, collapse to icons, and survives a reload", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await startFreshAccount(page);
  const top = page.getByRole("navigation", { name: "Main pages" });
  const side = page.getByRole("navigation", { name: "Side menu" });

  await test.step("by default the tab strip is shown and the side menu is not", async () => {
    await expect(top).toBeVisible();
    await expect(side).toBeHidden();
  });

  if (phone) {
    await test.step("a phone has no choice to make and keeps its bottom bar even if the saved choice says left", async () => {
      await page.context().addCookies([{ name: "nav_position", value: "left", url: page.url() }]);
      await page.reload();
      await expect(top).toBeVisible();
      await expect(side).toBeHidden();
    });
    return;
  }

  await test.step("choose Left in the settings: the side menu appears and the tab strip goes", async () => {
    await page.getByRole("button", { name: "Appearance and layout settings" }).click();
    await page.getByRole("radio", { name: "Navigation down the left" }).click();
    await page.keyboard.press("Escape");
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
    ]) {
      await expect(side.getByRole("link", { name })).toBeVisible();
    }
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

  await test.step("switching back to Top restores the tab strip", async () => {
    await page.getByRole("button", { name: "Appearance and layout settings" }).click();
    await page.getByRole("radio", { name: "Navigation along the top" }).click();
    await page.keyboard.press("Escape");
    await expect(top).toBeVisible();
    await expect(side).toBeHidden();
  });
});
