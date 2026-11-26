import { expect, test } from "./helpers";

const SPONSORS_URL = "https://github.com/sponsors/zontak-ai";

/** Both donate links on the home page point at the live Sponsors page, never the old org name (404). */
test("the home page's donate links point to sponsors/zontak-ai", async ({ page }) => {
  await page.goto("/");

  await test.step("the promise link and the footer link use the live address", async () => {
    await expect(page.getByRole("link", { name: "Support on GitHub Sponsors" })).toHaveAttribute("href", SPONSORS_URL);
    const footerLink = page.locator("footer").getByRole("link", { name: "Support UseHourly" });
    await expect(footerLink).toHaveAttribute("href", SPONSORS_URL);
    await expect(footerLink).toHaveAttribute("target", "_blank");
  });

  await test.step("no link uses the old org name", async () => {
    const hrefs = await page.locator("a[href]").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
    expect(hrefs.filter((href) => /sponsors\/zontak-llc/i.test(href))).toHaveLength(0);
  });
});
