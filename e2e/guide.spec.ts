import { expect, startFreshAccount, test } from "./helpers";

/** The guide and FAQ: public, searchable, reachable from the app's menu and from the "?" beside confusing settings. */
test("a visitor can search the guide, read a topic and the FAQ, with no account", async ({ page, request }) => {
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Guide", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Logging time" })).toBeVisible(); // topics are grouped under headings

  await test.step("searching finds a topic by the words a person would type", async () => {
    await page.getByRole("searchbox", { name: "Search the guide" }).fill("round up");
    const results = page.getByRole("link", { name: /Rounding time on invoices/ });
    await expect(results.first()).toBeVisible();
    await page.getByRole("searchbox", { name: "Search the guide" }).fill("zzzzqqq");
    await expect(page.getByText(/Nothing matches that/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Logging time" })).toBeVisible(); // falls back to the full list
    await page.getByRole("searchbox", { name: "Search the guide" }).fill("round up");
    await page
      .getByRole("link", { name: /Rounding time on invoices/ })
      .first()
      .click();
  });

  await test.step("a topic page reads well and links on to related topics", async () => {
    await expect(page).toHaveURL(/\/help\/rounding$/);
    await expect(page.getByRole("heading", { name: "Rounding time on invoices", level: 1 })).toBeVisible();
    await expect(page.getByText("Billing details").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "More in this group" })).toBeVisible();
  });

  await test.step("the FAQ answers common questions, and a search result can jump to one", async () => {
    await page.goto("/help");
    await page.getByRole("searchbox", { name: "Search the guide" }).fill("free");
    await page.getByRole("link", { name: /Is UseHourly really free/ }).click();
    await expect(page).toHaveURL(/\/help\/faq#free$/);
    await expect(page.getByRole("heading", { name: "Is UseHourly really free?" })).toBeVisible();
    await expect(page.getByText(/no paid plans/i)).toBeVisible();
  });

  await test.step("the FAQ has its own search, which also offers matching guide topics", async () => {
    await page.goto("/help/faq");
    await expect(page.getByRole("heading", { name: "Is UseHourly really free?" })).toBeVisible();
    await page.getByRole("searchbox", { name: "Search the FAQ" }).fill("export");
    await expect(page.getByRole("heading", { name: "Can I get my data out?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Is UseHourly really free?" })).toBeHidden();
    await expect(page.getByRole("region", { name: "Also in the guide" })).toContainText("Share & export");
    await page.getByRole("searchbox", { name: "Search the FAQ" }).fill("zzzzqqq");
    await expect(page.getByText("No question matches that.")).toBeVisible();
    await page.getByRole("searchbox", { name: "Search the FAQ" }).fill("");
    await expect(page.getByRole("heading", { name: "Is UseHourly really free?" })).toBeVisible();
  });

  await test.step("a visitor with no account sees a plain header, not the app's pages", async () => {
    await page.goto("/help/faq");
    await expect(page.getByRole("navigation", { name: "Main pages" })).toHaveCount(0); // no Today, Week, Clients ...
    await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/auth/v2/login");
    await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/auth/v2/register");
    await expect(page.getByRole("link", { name: "UseHourly" }).first()).toHaveAttribute("href", "/");
    // nothing personal and no leftovers of the old header
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open the app" })).toHaveCount(0);
  });

  await test.step("every topic is listed in the guide's own contents, with the page you are on marked", async () => {
    await page.goto("/help/rounding");
    const phone = (page.viewportSize()?.width ?? 1280) < 1024;
    if (phone) await page.getByText("Browse all topics").click();
    const toc = page.getByRole("navigation", { name: phone ? "Guide topics (phone)" : "Guide topics" });
    await expect(toc.getByRole("link", { name: "Rounding time on invoices" })).toHaveAttribute("aria-current", "page");
    await expect(toc.getByRole("link", { name: "Making an invoice" })).not.toHaveAttribute("aria-current", "page");
    await expect(toc.getByText("Invoices and money", { exact: true })).toBeVisible(); // grouped under headings
    await expect(toc.getByRole("link", { name: "FAQ" })).toBeVisible();
    await toc.getByRole("link", { name: "Project budgets" }).click();
    await expect(page).toHaveURL(/\/help\/budgets$/);
    await expect(page.getByRole("heading", { name: "Project budgets", level: 1 })).toBeVisible();
  });

  await test.step("a made-up topic is a normal not-found page", async () => {
    expect((await request.get("/help/not-a-topic")).status()).toBe(404);
  });
});

test("the app links to the guide: the menu, and a ? beside the settings that are easy to misunderstand", async ({
  page,
  context,
}) => {
  await startFreshAccount(page);
  await test.step("the top bar has a Guide link at the top right, beside the settings", async () => {
    const link = page.getByRole("link", { name: "Guide and FAQ" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/help");
    const gear = await page.getByRole("button", { name: "Appearance and layout settings" }).boundingBox();
    const guide = await link.boundingBox();
    expect(guide?.x ?? 0).toBeLessThan(gear?.x ?? 0); // just left of the gear, in the same top bar
    expect(Math.abs((guide?.y ?? 0) - (gear?.y ?? 99))).toBeLessThan(4);
  });

  await test.step("the guide keeps the app's navigation for a signed-in person, with nothing personal in it", async () => {
    await page.goto("/help/faq");
    const tabs = page.getByRole("navigation", { name: "Main pages" });
    await expect(tabs.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/dashboard/today");
    await expect(tabs.getByRole("link", { name: "Clients" })).toBeVisible();
    // the guide is cached on devices for offline use: no name, no address, no Log out in it
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
    await tabs.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menuitem", { name: "Log out" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto("/dashboard/today");
  });

  await test.step("the menu has a Guide entry", async () => {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Guide" }).click();
    await expect(page).toHaveURL(/\/help$/);
  });

  await test.step("the ? beside rounding opens the matching topic in a new tab", async () => {
    await page.goto("/dashboard/clients");
    await page
      .getByRole("button", { name: /More actions for (?!Clients$)/ })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Billing details" }).click();
    const help = page.getByRole("link", { name: "Guide: rounding time on invoices" });
    await expect(help).toHaveAttribute("href", "/help/rounding");
    await expect(help).toHaveAttribute("target", "_blank");
    const [tab] = await Promise.all([context.waitForEvent("page"), help.click()]);
    await expect(tab.getByRole("heading", { name: "Rounding time on invoices", level: 1 })).toBeVisible();
    await tab.close();
  });

  await test.step("the accounting export on Account has one too", async () => {
    await page.goto("/dashboard/account");
    await expect(page.getByRole("link", { name: "Guide: Xero and QuickBooks" })).toHaveAttribute(
      "href",
      "/help/xero-quickbooks",
    );
  });
});
