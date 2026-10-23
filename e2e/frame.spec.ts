import type { Locator, Page } from "@playwright/test";

import { expect, newUser, startDemo, startFreshAccount, test } from "./helpers";

/** The app's frame (issue 217): the tabs, the top bar, the sign-in header and the demo banner. */

const box = async (l: Locator) => {
  const b = await l.boundingBox();
  if (!b) throw new Error("not on screen");
  return b;
};
const overlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Every element fits its own box: no word cut off ("Usel…"). */
async function notClipped(l: Locator) {
  expect(await l.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
}

test("the tabs are the six pages, with no More menu; Account is in the account menu", async ({ page }) => {
  await startFreshAccount(page);
  const tabs = page.getByRole("navigation", { name: "Main pages" });
  await expect(tabs.getByRole("link")).toHaveText(["Today", "Week", "Month", "Invoices", "Clients", "Year"]);
  await expect(tabs.getByRole("button")).toHaveCount(0);
  for (const link of await tabs.getByRole("link").all()) {
    await expect(link).toBeInViewport({ ratio: 1 }); // all six fit, on a phone too
    await notClipped(link);
  }
  await tabs.getByRole("link", { name: "Year" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Year summary/);

  await page.getByRole("button", { name: /^Account menu for/ }).click();
  await page.getByRole("menuitem", { name: "Account", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/account/);
});

test("a long name does not push the top bar onto two rows, and the logo is never cut", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "the wide top bar");
  const user = { ...newUser(), name: "Maximiliana Alexandra Fitzgerald-Worthington" };
  const made = await page.request.post("/api/trpc/account.register", {
    data: { name: user.name, email: user.email, password: user.password },
  });
  expect(made.ok()).toBe(true);
  const { csrfToken } = (await (await page.request.get("/api/auth/csrf")).json()) as { csrfToken: string };
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email: user.email, password: user.password, json: "true" },
  });
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/dashboard/week");
    const tabs = page.getByRole("navigation", { name: "Main pages" });
    const header = page.locator("header").filter({ has: tabs });
    const menu = page.getByRole("button", { name: /^Account menu for/ });
    await expect(menu).not.toContainText(user.name); // initials only in the bar
    expect((await box(header)).height, `${width}px`).toBeLessThan(72); // one row
    const logo = header.getByRole("link", { name: "UseHourly" });
    await notClipped(logo);
    expect(overlap(await box(logo), await box(tabs)), `${width}px: logo under the tabs`).toBe(false);
    expect(overlap(await box(menu), await box(tabs)), `${width}px: menu under the tabs`).toBe(false);
  }
});

async function headerApart(page: Page, path: string, link: string) {
  await page.goto(path);
  const header = page.locator("main > header");
  const logo = header.getByRole("link", { name: "UseHourly" });
  const other = header.getByRole("link", { name: link, exact: true });
  const theme = header.getByRole("button", { name: "Dark mode" });
  for (const l of [logo, other, theme]) await expect(l).toBeInViewport({ ratio: 1 });
  const [a, b, c] = [await box(logo), await box(other), await box(theme)];
  expect(overlap(a, b), `${path}: link over the logo`).toBe(false);
  expect(overlap(b, c), `${path}: the moon over the link`).toBe(false);
  // the card is below the header, never under it
  expect((await box(page.getByRole("heading", { level: 1 }))).y).toBeGreaterThan(b.y + b.height);
}

test("the sign-in header keeps the logo, the other form's link and the moon apart", async ({ page }) => {
  await headerApart(page, "/auth/v2/login", "Create an account");
  await headerApart(page, "/auth/v2/register", "Log in");
  await headerApart(page, "/auth/v2/forgot-password", "Back to log in");
  await page.getByRole("link", { name: "Back to log in" }).click();
  await expect(page).toHaveURL(/\/auth\/v2\/login/);
});

test("the demo banner is one line on a phone, and Start fresh clears the sample data at once", async ({
  page,
}, info) => {
  await startDemo(page);
  await page.goto("/dashboard/today");
  const banner = page.getByTestId("demo-banner");
  await expect(banner).toBeVisible();
  if (info.project.name === "phone") expect((await box(banner)).height).toBeLessThan(48);
  await expect(banner.getByRole("link")).toHaveAttribute("href", "/dashboard/account#claim");
  await expect(page.getByLabel("Time to add")).toBeVisible(); // the sample clients are there

  // the search does not offer what a sample account cannot use
  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", { name: /Search pages, settings/ });
  await search.fill("password");
  await expect(page.getByRole("option", { name: /Change password/ })).toHaveCount(0);
  await search.fill("delete");
  await expect(page.getByRole("option", { name: /Delete account/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/dashboard/account#claim");
  const card = page.locator("#claim");
  const user = newUser();
  await card.getByLabel("Your name").fill(user.name);
  await card.getByLabel("Email").fill(user.email);
  await card.getByLabel("Password").fill(user.password);
  await expect(card.getByRole("radio", { name: /Start fresh/ })).toBeChecked();
  await card.getByRole("button", { name: "Create my account" }).locator("visible=true").click();
  await expect(page).toHaveURL(/\/dashboard\/today/, { timeout: 20_000 });
  // no reload: the sample clients are gone from the screen, so the first-run question shows
  await expect(page.getByPlaceholder(/company or a person/i)).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("hourly:lastProject"))).toBeNull();
});
