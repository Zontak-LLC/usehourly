import { expect, invoiceRows, openInvoice, startDemo, test, today } from "./helpers";

/**
 * Invoices as a split view, like Clients (2026-10-24): the list on the left, the chosen invoice on the right with its
 * actions, panels and a preview. Each invoice has its own address; a phone shows the list and the invoice as two screens.
 */
test("pick an invoice: its address, reload, Back, actions on the shown invoice, Send in its pane", async ({
  page,
}, info) => {
  const phone = info.project.name === "phone";
  await startDemo(page); // the sample data has a paid and an unpaid invoice
  await page.goto("/dashboard/invoices");
  const rows = invoiceRows(page);
  await expect(rows).toHaveCount(2);
  const [first, second] = await rows.evaluateAll((els) => els.map((r) => r.getAttribute("data-number") ?? ""));
  // the phone's "‹ Invoices" at the top of the invoice (not the tab bar's Invoices)
  const backLink = () => page.locator("[data-view=detail]").getByRole("link", { name: "Invoices", exact: true });
  const shown = (n: string) => page.getByRole("region", { name: `Invoice ${n}`, exact: true });

  await test.step("no invoice in the address: a wide screen shows the first one, a phone only the list", async () => {
    await expect(page).toHaveURL(/\/dashboard\/invoices$/);
    if (phone) await expect(shown(first)).toBeHidden();
    else await expect(shown(first).getByRole("heading", { level: 2 })).toHaveText(first);
  });

  await test.step("picking a row opens that invoice and puts it in the address; reload keeps it", async () => {
    const { detail } = await openInvoice(page, 1);
    await expect(detail.getByRole("heading", { level: 2 })).toHaveText(second);
    await expect(detail.getByTestId("invoice-preview")).toContainText(`Invoice ${second}`);
    if (phone) await expect(page.getByRole("region", { name: "Your invoices" })).toBeHidden();
    else await expect(rows.nth(1).getByRole("link")).toHaveAttribute("aria-current", "page");
    const url = page.url();
    await page.reload();
    expect(page.url()).toBe(url);
    await expect(shown(second).getByRole("heading", { level: 2 })).toHaveText(second);
  });

  await test.step("Back returns to the list", async () => {
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/invoices$/);
    await expect(page.getByRole("region", { name: "Your invoices" })).toBeVisible();
  });

  await test.step("Mark paid acts on the shown invoice, and its row then says Paid", async () => {
    const unpaid = page.locator('[data-testid="invoice-row"]:not([data-state="paid"])').first();
    const { number, detail } = await openInvoice(page, unpaid);
    await detail.getByRole("button", { name: "Mark paid" }).click();
    await detail.getByLabel("Date the money arrived").fill(today());
    await detail.getByRole("button", { name: "Save", exact: true }).click();
    await expect(detail.getByTestId("invoice-state")).toHaveText(/^Paid \w{3} \d+$/);
    await expect(detail.getByRole("button", { name: "Mark paid" })).toHaveCount(0);
    if (phone) await backLink().click();
    await expect(rows.and(page.locator(`[data-number="${number}"]`))).toHaveAttribute("data-state", "paid");
    await expect(rows.and(page.locator(`[data-number="${number}"]`))).toContainText(/Paid \w{3} \d+/);
  });

  await test.step("Send opens its email in the invoice's own pane", async () => {
    const { number, detail } = await openInvoice(page, 0);
    await detail.getByRole("button", { name: `Send ${number}` }).click();
    await expect(detail.getByRole("region", { name: `Send invoice ${number}` })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Your invoices" }).getByRole("region", { name: /^Send/ }),
    ).toHaveCount(0);
  });

  // A phone has two screens: "‹ Invoices" at the top of the invoice goes back to the list.
  if (phone)
    await test.step("the phone's ‹ Invoices goes back to the list", async () => {
      await backLink().click();
      await expect(page).toHaveURL(/\/dashboard\/invoices$/);
      await expect(page.getByRole("region", { name: "Your invoices" })).toBeVisible();
    });
});

test("an unknown invoice address says so calmly and points back to the list", async ({ page }) => {
  await startDemo(page);
  await page.goto("/dashboard/invoices/not-an-invoice");
  await expect(page.getByText("This invoice is not on your list. It may have been deleted.")).toBeVisible();
  await page.getByRole("link", { name: "Back to your invoices" }).click();
  await expect(page).toHaveURL(/\/dashboard\/invoices$/);
  await expect(invoiceRows(page).first()).toBeVisible();
});

test("the filter's four tabs share one row, also on a phone, and the search narrows the list", async ({ page }) => {
  await startDemo(page);
  await page.goto("/dashboard/invoices");
  const tabs = page.getByRole("tablist", { name: "Show invoices" }).getByRole("tab");
  await expect(tabs).toHaveCount(4);
  const tops = await tabs.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size, `tab tops ${tops.join(", ")}`).toBe(1);
  const heights = await tabs.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);

  const rows = invoiceRows(page);
  const number = (await rows.first().getAttribute("data-number")) ?? "";
  await page.getByRole("searchbox", { name: "Search invoices" }).fill(number);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("data-number", number);
  await page.getByRole("searchbox", { name: "Search invoices" }).fill("nothing like this");
  await expect(page.getByText("No invoices match that.")).toBeVisible();
});
