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

  await test.step("a made-up topic is a normal not-found page", async () => {
    expect((await request.get("/help/not-a-topic")).status()).toBe(404);
  });
});

test("the app links to the guide: the menu, and a ? beside the settings that are easy to misunderstand", async ({
  page,
  context,
}) => {
  await startFreshAccount(page);
  await test.step("the menu has a Guide entry", async () => {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Guide" }).click();
    await expect(page).toHaveURL(/\/help$/);
  });

  await test.step("the ? beside rounding opens the matching topic in a new tab", async () => {
    await page.goto("/dashboard/clients");
    await page
      .getByRole("button", { name: /billing details/i })
      .first()
      .click();
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
