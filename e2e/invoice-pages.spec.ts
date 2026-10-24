import { expect, invoiceRows, openInvoice, sql, startDemo, test } from "./helpers";

const numbersOf = (rows: ReturnType<typeof invoiceRows>) =>
  rows.evaluateAll((els) => els.map((r) => r.getAttribute("data-number")));

/** The invoice list is paginated: a phone shows 3 at a time, a wide screen 10, with the arrow buttons. */
test("the invoice list is paginated: 3 per page on a phone, 10 on a wide screen", async ({ page }, info) => {
  await startDemo(page);
  // This test's own account (not "the newest sample account", which another test running at the same time may have made).
  const session = (await (await page.request.get("/api/auth/session")).json()) as { user?: { id?: string } };
  const userId = session.user?.id ?? "";
  expect(userId).toMatch(/^[0-9a-f-]{20,}$/);
  // The sample data has two invoices; copy one nine times (numbers INV-2099-001 to 009) so there are eleven: more than
  // one wide-screen page of ten and four phone pages of three.
  sql(
    `WITH RECURSIVE n(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM n WHERE n < 9)
    INSERT INTO invoices (id, user_id, client_id, client_name, number, issue_date, due_date, paid_date, period_from,
    period_to, total_minutes, total_cents, currency, notes, snapshot, search_text, summary, remind_overdue, reminders_sent, created_at)
    SELECT lower(hex(randomblob(16))), i.user_id, i.client_id, i.client_name, 'INV-2099-' || printf('%03d', n.n), i.issue_date,
      i.due_date, i.paid_date, i.period_from, i.period_to, i.total_minutes, i.total_cents, i.currency, i.notes, i.snapshot,
      i.search_text, i.summary, 0, 0, i.created_at
    FROM (SELECT * FROM invoices WHERE user_id = '${userId}' LIMIT 1) i,
      n`.replace(/\s+/g, " "),
  );
  await page.goto("/dashboard/invoices");

  const card = page.getByRole("region", { name: "Your invoices" });
  await expect(card).toBeVisible();
  const rows = invoiceRows(page);
  const pager = card.getByRole("navigation", { name: "invoices pages" });
  const per = info.project.name === "phone" ? 3 : 10;

  await expect(rows).toHaveCount(per);
  await expect(pager).toContainText(`1–${per} of 11`);
  await expect(pager.getByRole("button", { name: "Previous page" })).toBeDisabled();
  const firstPage = await numbersOf(rows);
  await pager.getByRole("button", { name: "Next page" }).click();
  await expect(pager).toContainText(`${per + 1}–${Math.min(2 * per, 11)} of 11`);
  const secondPage = await numbersOf(rows);
  expect(secondPage.filter((n) => firstPage.includes(n))).toEqual([]);
  await pager.getByRole("button", { name: "Previous page" }).click();
  await expect.poll(() => numbersOf(rows)).toEqual(firstPage);
});

test("each invoice says its state in words, unpaid ones have Mark paid, and the tabs narrow the list", async ({
  page,
}) => {
  await startDemo(page);
  await page.goto("/dashboard/invoices");

  const invoices = invoiceRows(page);
  const tabs = page.getByRole("tablist", { name: "Show invoices" });
  await expect(invoices.first()).toBeVisible();
  const all = await invoices.count();
  expect(all).toBeGreaterThanOrEqual(2); // the sample data has a paid and an unpaid invoice
  // the state is in words beside the amount: Paid Oct 20, Due in 5 days, 3 days late, Due today, Waiting
  for (const row of await invoices.all())
    await expect(row).toContainText(/Paid \w{3} \d+|Due in \d+ days?|\d+ days? late|Due today|Waiting/);

  await test.step("the tabs: All is chosen, Paid shows only paid ones, Waiting only unpaid ones", async () => {
    await expect(tabs.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true");
    await tabs.getByRole("tab", { name: /^Paid/ }).click();
    await expect(tabs.getByRole("tab", { name: /^Paid/ })).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => invoices.count()).toBeLessThan(all);
    for (const row of await invoices.all()) await expect(row).toHaveAttribute("data-state", "paid");
    const paid = await openInvoice(page, 0);
    await expect(paid.detail.getByRole("button", { name: "Mark paid" })).toHaveCount(0);
    await page.goto("/dashboard/invoices");
    await tabs.getByRole("tab", { name: /^Waiting/ }).click();
    await expect.poll(() => invoices.count()).toBeGreaterThan(0);
    for (const row of await invoices.all()) await expect(row).not.toHaveAttribute("data-state", "paid");
  });

  await test.step("Mark paid opens its panel in the invoice and closes on a second press", async () => {
    const { detail } = await openInvoice(page, 0);
    const mark = detail.getByRole("button", { name: "Mark paid" });
    await expect(mark).toHaveAttribute("aria-expanded", "false");
    await mark.click();
    await expect(mark).toHaveAttribute("aria-expanded", "true");
    await expect(detail.getByRole("region", { name: /^Mark as paid INV-/ })).toBeVisible();
    await mark.click();
    await expect(mark).toHaveAttribute("aria-expanded", "false");
  });

  // there are no folded filters any more: one search box
  await page.goto("/dashboard/invoices");
  await expect(page.getByRole("button", { name: "Filters" })).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search invoices" })).toBeVisible();
});

test("Open full size shows the invoice alone with Download PDF and Print; the download icon downloads too", async ({
  page,
}) => {
  await startDemo(page);
  await page.goto("/dashboard/invoices");
  const { number, detail } = await openInvoice(page, 0);
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    detail.getByRole("button", { name: `Download ${number} as a PDF` }).click(),
  ]);
  expect(file.suggestedFilename()).toBe(`${number}.pdf`);
  // the preview is the client's view, smaller
  await expect(detail.getByTestId("invoice-preview").getByRole("heading", { name: `Invoice ${number}` })).toBeVisible();
  await detail.getByRole("link", { name: "Open full size" }).click();
  await expect(page).toHaveURL(/\/dashboard\/invoices\/[^/]+\?full=1$/);
  await expect(page.getByRole("heading", { level: 1, name: number })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: `Invoice ${number}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: /Download PDF/ })
      .first()
      .click(),
  ]);
  expect(pdf.suggestedFilename()).toBe(`${number}.pdf`);
  await page.getByRole("link", { name: "Back to invoices" }).click();
  await expect(page).toHaveURL(/\/dashboard\/invoices\/[^/?]+$/);
  await expect(page.getByRole("region", { name: `Invoice ${number}`, exact: true })).toBeVisible();
});
