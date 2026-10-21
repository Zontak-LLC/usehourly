import { expect, startFreshAccount, test } from "./helpers";

/**
 * The main navigation is down the left on a wide screen by default (2026-10-20): using the side menu (always open, no
 * collapsing), keeping the choice across a reload, switching to the tab strip along the top in the settings gear and back,
 * and phones keeping their bottom bar.
 */
test("navigation sits down the left by default, stays open, and survives a reload", async ({ page }, info) => {
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
      "Clients",
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

  await test.step("the menu is always open: there is no collapse button and no way to fold it to icons", async () => {
    await expect(side.getByRole("button", { name: /Collapse menu/ })).toHaveCount(0);
    await expect(side.getByText("Track", { exact: true })).toBeVisible();
    expect((await side.boundingBox())?.width ?? 0).toBeGreaterThan(200);
    await side.getByRole("link", { name: "Month" }).dblclick(); // a double click goes to the page and folds nothing
    await expect(page).toHaveURL(/dashboard\/month/);
    expect((await side.boundingBox())?.width ?? 0).toBeGreaterThan(200);
  });

  await test.step("the page card still fits beside the menu without sideways scrolling", async () => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  await test.step("the choice survives a reload and is applied on the first paint", async () => {
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-nav-position", "left");
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
