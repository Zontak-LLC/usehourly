import { FEATURES } from "../src/lib/features";
import { expect, startFreshAccount, test } from "./helpers";

/** The Help page (issue #216): one search box, six common questions that open in place, and old guide links that still land. */
test("a visitor finds an answer by searching, opens it in place, and old guide links still land", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search help" });
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Help", level: 1 })).toBeVisible();

  await test.step("the common questions show first, and one opens and closes in place", async () => {
    await expect(page.getByRole("heading", { name: "Common questions" })).toBeVisible();
    const free = page.getByRole("button", { name: "Is UseHourly really free?" });
    await expect(free).toHaveAttribute("aria-expanded", "false");
    await free.click();
    await expect(free).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/no paid plans/i)).toBeVisible();
    await free.click();
    await expect(page.getByText(/no paid plans/i)).toBeHidden();
    await expect(page.getByRole("button", { name: /^(How|Can|Who|Is)/ })).toHaveCount(6);
  });

  await test.step("searching finds deeper answers as you type, with the matching words marked", async () => {
    await search.fill("hourly rate");
    await expect(page.getByRole("heading", { name: /answers?$/ })).toBeVisible();
    const rate = page.getByRole("button", { name: "Where do I set my hourly rate?" });
    await expect(rate.locator("mark").first()).toHaveText(/hourly/i);
    await rate.click();
    await expect(page.getByText(/drag the slider or type it/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Common questions" })).toHaveCount(0);
  });

  await test.step("nothing found says so, and the × clears the search", async () => {
    await search.fill("zzzzqqq");
    await expect(page.getByRole("heading", { name: "No answer matches “zzzzqqq”" })).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(search).toHaveValue("");
    await expect(page.getByRole("heading", { name: "Common questions" })).toBeVisible();
  });

  await test.step("a link inside an answer opens the other answer on the same page", async () => {
    await page.getByRole("button", { name: "Can I use it on my phone, and offline?" }).click();
    await page.getByRole("link", { name: "Working offline" }).click();
    await expect(page).toHaveURL(/\/help\?a=offline$/);
    await expect(page.getByRole("button", { name: "What works offline, with no connection?" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // the same link again, from a search, while the address already says ?a=offline: it still opens the answer
    await search.fill("phone");
    await expect(page.getByRole("button", { name: "Can I use it on my phone, and offline?" })).toHaveAttribute(
      "aria-expanded",
      "true",
    ); // still open from before
    await page.getByRole("link", { name: "Working offline" }).click();
    await expect(search).toHaveValue("");
    await expect(page.getByRole("button", { name: "What works offline, with no connection?" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  await test.step("an old topic address opens the answer that replaced it", async () => {
    await page.goto("/help/making-an-invoice");
    await expect(page).toHaveURL(/\/help\?a=invoice$/);
    await expect(page.getByRole("button", { name: "How do I make an invoice and send it?" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  await test.step("an old FAQ anchor opens its answer, and an unknown topic becomes a search", async () => {
    await page.goto("/help/faq#export");
    await expect(page).toHaveURL(/\/help#export$/);
    await expect(page.getByRole("button", { name: "Can I get my data out, or delete my account?" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.goto("/help/not-a-topic");
    await expect(page).toHaveURL(/\/help\?q=not%20a%20topic$/);
    await expect(search).toHaveValue("not a topic");
    if (!FEATURES.rounding) {
      await page.goto("/help/rounding"); // a topic about a hidden feature finds the visible answer
      await expect(page.getByRole("button", { name: "Does it round my time?" })).toBeVisible();
    }
  });

  await test.step("a visitor with no account sees a plain header, not the app's pages", async () => {
    await expect(page.getByRole("navigation", { name: "Main pages" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/auth/v2/login");
    await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/auth/v2/register");
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
  });
});

test("the app links to Help from the account menu and the side menu, and no ? button is left in the top bar", async ({
  page,
}) => {
  await startFreshAccount(page);
  await test.step("the top bar has no ? button any more", async () => {
    await expect(page.getByRole("link", { name: "Guide and FAQ" })).toHaveCount(0);
  });

  await test.step("the account menu has Help", async () => {
    await page.getByRole("button", { name: /^Account menu for/ }).click();
    await page.getByRole("menuitem", { name: "Help" }).click();
    await expect(page).toHaveURL(/\/help$/);
  });

  await test.step("Help keeps the app's navigation for a signed-in person, with nothing personal in it", async () => {
    const tabs = page.getByRole("navigation", { name: "Main pages" });
    await expect(tabs.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/dashboard/today");
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
    await tabs.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menuitem", { name: "Log out" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Help" }).click();
    await expect(page).toHaveURL(/\/help$/);
  });

  await test.step("the Export menu no longer sends people to read about it", async () => {
    await page.goto("/dashboard/week");
    await page.getByRole("button", { name: /^(Share & export|Export)$/ }).click();
    await expect(page.getByRole("menuitem", { name: "Which one do I use?" })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });
});
