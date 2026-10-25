import { FEATURES } from "../src/lib/features";
import { anonymous, expect, openInvoice, seedFirstDay, seen, test, today } from "./helpers";
import { readFileSync } from "node:fs";

/**
 * A new freelancer's first day, part 3 of 4: with 3 hours logged at $60/h (made through the API, issue 331), make the
 * invoice, mark it paid, write its email and open its private link as the client, then see the year summary, a
 * non-billable day and the files for an accounting app.
 *
 * `actions` counts what the person has to do to make the invoice, held to a budget (see part 1).
 */
test("a new freelancer's first day: invoice", async ({ page, browser, shot, audit, a11y }, info) => {
  await seedFirstDay(page, { rate: 6000, minutes: [120, 60] });
  const actions = { invoice: 0 };
  const count = (job: keyof typeof actions, n = 1) => {
    actions[job] += n;
  };

  await test.step("make an invoice from the logged time", async () => {
    await page.goto("/dashboard/invoices");
    await expect(page.getByLabel("Search invoices")).toBeHidden(); // nothing to search yet
    await shot("invoices-empty");
    await audit("invoices empty");
    await page
      .getByRole("link", { name: /new invoice/i })
      .first()
      .click();
    count("invoice");
    await expect(seen(page, "$180.00")).toBeVisible(); // 3 h at $60
    await shot("invoice-builder");
    await audit("invoice builder");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Create invoice/ }).click(),
    ]);
    count("invoice");
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    await expect(page.getByText(/INV-\d{4}-001/).first()).toBeVisible();
    await shot("invoice-made");
  });

  await test.step("mark it paid", async () => {
    await page.goto("/dashboard/invoices");
    const { detail: invoice } = await openInvoice(page, 0);
    await invoice.getByRole("button", { name: "Mark paid" }).click(); // the button on the invoice
    await page.getByLabel("Date the money arrived").fill(today());
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByLabel("Date the money arrived")).toBeHidden(); // the panel closes once saved
    await expect(invoice.getByTestId("invoice-state")).toHaveText(/Paid \w{3} \d+/); // in words: "Paid Oct 23"
    await expect(invoice.getByRole("button", { name: "Mark paid" })).toHaveCount(0);
    await shot("invoice-paid");
    // An invoice offers at most four buttons (Mark paid until paid, Send, PDF, ···).
    const controls = await invoice.getByTestId("invoice-actions").getByRole("button").count();
    expect.soft(controls, "controls on an invoice").toBeLessThanOrEqual(4);
    await audit("invoices with one invoice");
    await a11y("invoices");
  });

  let invoiceUrl = "";
  await test.step("write the invoice email for my own mail app, and open its private link as the client", async () => {
    // The Send panel writes the email and makes a private link; nothing is sent from UseHourly (#227).
    // The list refreshes when the link is saved and can close the panel for a moment on a busy machine: open it again if so.
    const linkBox = page.getByLabel("Invoice link");
    await expect(async () => {
      if (!(await linkBox.isVisible())) await page.getByRole("button", { name: /^Send INV-/ }).click();
      await expect(linkBox).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30_000 });
    const mailApp = page.getByRole("link", { name: "Open in my email app" });
    await expect(mailApp).toHaveAttribute("href", /^mailto:\?subject=Invoice%20INV-/);
    await expect(page.getByLabel("Message")).toHaveValue(new RegExp(`${await linkBox.inputValue()}`));
    await expect(page.getByRole("button", { name: "Send the email" })).toHaveCount(0); // UseHourly never sends it
    await shot("send-panel");
    invoiceUrl = await linkBox.inputValue();
    expect(invoiceUrl).toMatch(/\/invoice\/\S{40,}/);
    const anon = await anonymous(browser, info);
    const client = await anon.newPage();
    await client.goto(invoiceUrl);
    await expect(client.getByRole("heading", { name: /Invoice INV-\d{4}-001/ })).toBeVisible();
    await expect(client.getByText(/Paid on/)).toBeVisible();
    await expect(seen(client, "$180.00")).toBeVisible();
    await client.screenshot({
      path: `e2e/report/screens/${info.project.name}/client-invoice.png`,
      fullPage: true,
      caret: "initial",
    });
    await anon.close();
    await page.keyboard.press("Escape");
  });

  await test.step("the year summary shows the work", async () => {
    await page.goto("/dashboard/report");
    await expect(seen(page, "$180.00")).toBeVisible();
    await shot("year-summary");
    await audit("year summary");
  });

  await test.step("mark today non-billable (on the Week day card): it stays on screen, flagged, and the year summary leaves it out", async () => {
    if (!FEATURES.nonBillableDays) return; // hidden in this release (src/lib/features.ts)
    await page.goto("/dashboard/week");
    await page.getByRole("button", { name: "Mark day non-billable" }).click();
    const marked = page.getByRole("button", { name: /Non-billable day/ });
    await expect(marked).toHaveAttribute("aria-pressed", "true");
    await expect(marked).toHaveAttribute("title", /left out of invoices, exports and the year summary/i);
    await expect(page.getByText("Logo concepts for the homepage").first()).toBeVisible(); // the work is still shown
    await expect(page.getByRole("tab", { name: /non-billable/ })).toBeVisible();
    await expect(page.getByText("Non-billable", { exact: true }).first()).toBeVisible(); // badge in the list
    await shot("non-billable-week");
    await audit("week, non-billable");

    await page.goto("/dashboard/report");
    await expect(page.getByRole("heading", { name: /Year summary/ })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("3.00 h");
    await shot("non-billable-year-summary");

    await page.goto("/dashboard/week");
    await page.getByRole("button", { name: /Non-billable day/ }).click(); // undo
    await expect(page.getByRole("button", { name: "Mark day non-billable" })).toBeVisible();
    await page.goto("/dashboard/report");
    await expect(page.locator("body")).toContainText("3.00 h");
  });

  await test.step("download the invoices as a file for Xero, QuickBooks and a payments list", async () => {
    if (!FEATURES.accountingExport) return; // hidden in this release (src/lib/features.ts)
    await page.goto("/dashboard/account#data");
    await expect(page.getByRole("region", { name: "Send invoices to your accounting app" })).toBeVisible();
    await shot("accounting-export");
    await audit("account, accounting export");

    const save = async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Download CSV" }).click(),
      ]);
      const path = await download.path();
      return { name: download.suggestedFilename(), text: path ? readFileSync(path, "utf8") : "" };
    };

    const xero = await save(); // Xero is the default format
    expect(xero.name).toMatch(/^usehourly-xero-\d{4}\.csv$/);
    expect(xero.text).toContain("*ContactName");
    expect(xero.text).toContain("Acme Studio");
    expect(xero.text).toMatch(/INV-\d{4}-\d{3}/);

    await page.getByLabel("Send to").selectOption("quickbooks");
    const quickbooks = await save();
    expect(quickbooks.name).toMatch(/^usehourly-quickbooks-\d{4}\.csv$/);
    expect(quickbooks.text).toContain("Item(Product/Service)");

    await page.getByLabel("Send to").selectOption("payments");
    const payments = await save(); // the journey marked its invoice paid
    expect(payments.name).toMatch(/^usehourly-payments-\d{4}\.csv$/);
    expect(payments.text).toMatch(/INV-\d{4}-\d{3}/);
  });

  // The effort budget: how many actions each job took. Printed every run; the limits catch a job getting harder.
  test.info().annotations.push({ type: "effort", description: JSON.stringify(actions) });
  console.log(`[effort ${info.project.name}] ${JSON.stringify(actions)}`);
  expect.soft(actions.invoice, "actions to make an invoice once there is logged time").toBeLessThanOrEqual(3);
});
