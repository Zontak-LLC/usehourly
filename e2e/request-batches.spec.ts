import { expect, startFreshAccount, test } from "./helpers";

/**
 * Every request to the server costs a full round trip before the page can show its data, and a page that asks for
 * more in a second step (once a component further down appears) pays for two. The busy pages therefore start all
 * their queries together, in ONE batched request. This fails when a screen starts asking for something late again.
 */
const PAGES: [label: string, heading: RegExp, url: string][] = [
  ["Today", /^Today$/, "/dashboard/today"],
  ["Week", /Weekly timesheet/, "/dashboard/week"],
  ["Month", /\d{4}$/, "/dashboard/month"],
  ["Clients & Projects", /Clients & Projects/, "/dashboard/clients"],
  ["Invoices", /^Invoices$/, "/dashboard/invoices"],
];

test("each busy page loads all its data in a single request", async ({ page }) => {
  await startFreshAccount(page);
  for (const [label, heading, url] of PAGES) {
    const calls: string[] = [];
    const onRequest = (r: { url(): string }) => {
      if (r.url().includes("/api/trpc/")) calls.push(decodeURIComponent(r.url().split("/api/trpc/")[1].split("?")[0]));
    };
    page.on("request", onRequest);
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600); // a late second batch would show up here
    page.off("request", onRequest);
    expect(calls, `${label}: requests to the API`).toHaveLength(1);
  }
});
