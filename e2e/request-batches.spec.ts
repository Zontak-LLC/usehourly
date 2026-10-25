import { expect, test, withSharedAccount } from "./helpers";

withSharedAccount(); // counts requests, not data

/**
 * Every request to the server costs a full round trip before the page can show its data, and a page that asks for
 * more in a second step (once a component further down appears) pays for two. The busy pages therefore start all
 * their queries together, in ONE batched request. This fails when a screen starts asking for something late again.
 */
const PAGES: [label: string, heading: RegExp, url: string][] = [
  ["Today", /^Today$/, "/dashboard/today"],
  ["Week", /Weekly timesheet/, "/dashboard/week"],
  ["Month", /\d{4}$/, "/dashboard/month"],
  ["Clients", /^Clients$/, "/dashboard/clients"],
  ["Invoices", /^Invoices$/, "/dashboard/invoices"],
  ["Account", /^Account$/, "/dashboard/account"],
  ["Year summary", /^Year summary · \d{4}$/, "/dashboard/report"],
];

test("each busy page loads all its data in a single request", async ({ page }) => {
  // The pre-cache of other pages (warm-pages.tsx) fires 3 s after load and could land in the watch window: Save-Data turns it off.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true });
  });
  for (const [label, heading, url] of PAGES) {
    const calls: string[] = [];
    const onRequest = (r: { url(): string }) => {
      if (r.url().includes("/api/trpc/")) calls.push(decodeURIComponent(r.url().split("/api/trpc/")[1].split("?")[0]));
    };
    page.on("request", onRequest);
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300); // nothing to wait for: a late second batch would show up here (networkidle already gave 500 ms)
    page.off("request", onRequest);
    expect(calls, `${label}: requests to the API`).toHaveLength(1);
  }
});
