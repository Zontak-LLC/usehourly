import { expect, test } from "./helpers";

/** The tour at the top of the landing page: a silent, looping tour of the app that the visitor can steer. */
const tabs = (page: import("@playwright/test").Page) => page.getByRole("tablist", { name: "Screens" }).getByRole("tab");
const selected = (page: import("@playwright/test").Page) =>
  page.getByRole("tablist", { name: "Screens" }).getByRole("tab", { selected: true });

test("the tour shows the first screen with six dots, and a dot goes to that screen", async ({ page }) => {
  await page.goto("/");
  const tour = page.getByRole("region", { name: "A tour of UseHourly" });
  await expect(tour).toBeVisible();
  await expect(tabs(page)).toHaveCount(6);
  await expect(selected(page)).toHaveAccessibleName("Show Today");
  const first = tour.getByRole("img", { name: /the Today screen/i });
  await expect.poll(() => first.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0); // really loaded

  await tabs(page).nth(2).click();
  await expect(selected(page)).toHaveAccessibleName("Show Month");
  await expect(tour.locator("p", { hasText: /^Month/ })).toBeVisible(); // the caption under the dots
  const month = tour.getByRole("img", { name: /month calendar/i });
  await expect(month).toBeInViewport({ timeout: 5000 }); // the track has slid across to it
  await expect.poll(() => month.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0); // and it loaded on demand
});

test("on its own it moves on to the next screen, and Pause keeps it where it is", async ({ page }, info) => {
  test.skip(
    info.project.name === "phone",
    "the pause button is for the wide layout; the dots work the same on a phone",
  );
  await page.goto("/");
  await page.getByRole("region", { name: "A tour of UseHourly" }).scrollIntoViewIfNeeded();
  await expect(selected(page)).toHaveAccessibleName("Show Week", { timeout: 25_000 }); // it advanced without anyone touching it

  // Invoices is a short page, so left alone the tour would leave it within about four seconds.
  await tabs(page).nth(3).click();
  await expect(selected(page)).toHaveAccessibleName("Show Invoices");
  await page.getByRole("button", { name: "Pause the tour" }).click();
  await expect(page.getByRole("button", { name: "Play the tour" })).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0); // the pointer is not what is holding it...
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // ...and neither is keyboard focus
  await page.waitForTimeout(8000);
  await expect(selected(page)).toHaveAccessibleName("Show Invoices"); // still there after twice as long as it stays

  await page.getByRole("button", { name: "Play the tour" }).click();
  await expect(page.getByRole("button", { name: "Pause the tour" })).toHaveAttribute("aria-pressed", "false");
});

test("with reduced motion it stands still, and the dots still work", async ({ browser }, info) => {
  const u = info.project.use;
  const ctx = await browser.newContext({
    baseURL: u.baseURL,
    viewport: u.viewport,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("region", { name: "A tour of UseHourly" }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(9000);
  await expect(selected(page)).toHaveAccessibleName("Show Today"); // nothing moved
  await tabs(page).nth(4).click();
  await expect(selected(page)).toHaveAccessibleName("Show Clients");
  await ctx.close();
});

test("a phone is shown phone-sized screens, and a wide screen the full pages", async ({ page }, info) => {
  await page.goto("/");
  const first = page.getByRole("region", { name: "A tour of UseHourly" }).getByRole("img").first();
  await expect
    .poll(() => first.evaluate((i: HTMLImageElement) => i.currentSrc))
    .toContain(info.project.name === "phone" ? "/landing/tour-phone/" : "/landing/tour/");
});
