import { expect, startFreshAccount, test } from "./helpers";

/**
 * The Account page is ONE page: every section is on it. A search box moves the sections that match to the top, and
 * quick links jump to a section. A link such as #data lands on its section.
 */
test("the Account page is one page; searching moves the matching section to the top; the quick links jump", async ({
  page,
}) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/account");
  const headings = () => page.locator('h2[id$="-heading"]').allInnerTexts();

  // everything is on the page, in the usual order, with no tabs
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "AI assistants", level: 2 })).toBeVisible();
  expect(await headings()).toEqual(["Profile", "Your data", "Invoices", "AI assistants"]);

  // typing a word brings its section to the top, and says so
  const search = page.getByRole("searchbox", { name: "Search your settings" });
  await search.fill("export");
  await expect.poll(headings).toEqual(["Your data", "Profile", "Invoices", "AI assistants"]);
  await expect(page.getByText("Best match first: Your data.")).toBeVisible();
  await expect(page.getByText("Everything else")).toBeVisible();

  // a word from another section moves that one up instead
  await search.fill("currenc");
  await expect.poll(headings).toEqual(["Invoices", "Profile", "Your data", "AI assistants"]);

  // nothing matches: nothing is hidden, and the page says so
  await search.fill("zzzzq");
  await expect(page.getByText("Nothing matches that. Every setting is still below.")).toBeVisible();
  expect(await headings()).toHaveLength(4);

  // Escape clears it and the usual order returns
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect.poll(headings).toEqual(["Profile", "Your data", "Invoices", "AI assistants"]);

  // a quick link jumps to its section
  await page
    .getByRole("navigation", { name: "Jump to a section" })
    .getByRole("link", { name: "AI assistants" })
    .click();
  await expect(page).toHaveURL(/#ai$/);
  await expect(page.getByRole("heading", { name: "AI assistants", level: 2 })).toBeInViewport();
});

test("an address with #data lands on the Your data section", async ({ page }) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/account#data");
  await expect(page.getByRole("heading", { name: "Your data", level: 2 })).toBeInViewport({ timeout: 15_000 });
});
