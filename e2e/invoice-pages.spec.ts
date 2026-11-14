import { expect, invoiceRows, openInvoice, sql, startDemo, test } from "./helpers";
import { createHash, randomBytes } from "node:crypto";

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

test.describe("overdue uses the viewer's own date, not the UTC date (issue 452)", () => {
  test.use({ timezoneId: "America/New_York" });

  const ZONE = "America/New_York";
  /** The instant it is `hh`:00 in New York on `date` (the offset is -05:00 or -04:00 with summer time). */
  const newYorkAt = (date: string, hh: number) => {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, timeZoneName: "longOffset" })
      .formatToParts(new Date(`${date}T12:00:00Z`))
      .find((p) => p.type === "timeZoneName")?.value;
    const offset = (name ?? "GMT-05:00").replace("GMT", "");
    return new Date(`${date}T${String(hh).padStart(2, "0")}:00:00${offset}`);
  };
  const nextDay = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

  test("on the evening of the due date it is not overdue; the next morning it is, on every page", async ({ page }) => {
    // D is today in New York, so the browser's clock stays within a day of the server's.
    const due = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date());
    await page.clock.setFixedTime(newYorkAt(due, 20)); // 20:00 in New York = 01:00 UTC on D+1
    await startDemo(page);
    const session = (await (await page.request.get("/api/auth/session")).json()) as { user?: { id?: string } };
    const userId = session.user?.id ?? "";
    expect(userId).toMatch(/^[0-9a-f-]{20,}$/);

    // The sample data's unpaid and paid invoices, both due on D, with numbers this test knows, and a private link to each.
    const unpaid = "INV-2099-452";
    const paid = "INV-2099-453";
    const unpaidToken = `e2e-overdue-${randomBytes(16).toString("hex")}`;
    const paidToken = `e2e-overdue-${randomBytes(16).toString("hex")}`;
    const hash = (t: string) => createHash("sha256").update(t).digest("hex");
    const pick = (paidClause: string) =>
      `(SELECT id FROM invoices WHERE user_id = '${userId}' AND paid_date ${paidClause} ORDER BY id LIMIT 1)`;
    const prepare = (number: string, paidClause: string, token: string) =>
      `UPDATE invoices SET number = '${number}', due_date = '${due}',
        snapshot = json_set(snapshot, '$.number', '${number}', '$.dueDate', '${due}') WHERE id = ${pick(paidClause)};
      INSERT INTO invoice_links (id, user_id, invoice_id, token_hash, token_prefix, expires_at, revoked_at, created_at)
        VALUES (lower(hex(randomblob(16))), '${userId}', ${pick(paidClause)}, '${hash(token)}', '${token.slice(0, 6)}',
        ${Math.floor(Date.now() / 1000) + 30 * 86_400}, NULL, strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'));`;
    sql(`${prepare(unpaid, "IS NULL", unpaidToken)} ${prepare(paid, "IS NOT NULL", paidToken)}`.replace(/\s+/g, " "));

    const note = page.getByText("This invoice was due on");
    const row = (number: string) => invoiceRows(page).and(page.locator(`[data-number="${number}"]`));
    const tabs = page.getByRole("tablist", { name: "Show invoices" });
    const showOverdue = async () => {
      await page.goto("/dashboard/invoices");
      await tabs.getByRole("tab", { name: /^Overdue/ }).click();
      await expect(tabs.getByRole("tab", { name: /^Overdue/ })).toHaveAttribute("aria-selected", "true");
    };
    const openFromList = async (number: string) => {
      await page.goto("/dashboard/invoices");
      await openInvoice(page, row(number));
      return page.url();
    };

    await test.step("20:00 in New York on D: due today, not overdue, on the list, the invoice page and the link", async () => {
      await page.goto("/dashboard/invoices");
      await expect(row(unpaid)).toContainText("Due today"); // the page has the browser's date by now
      const unpaidPage = await openFromList(unpaid);
      await page.goto(unpaidPage);
      await expect(page.getByRole("heading", { level: 2, name: unpaid, exact: true })).toBeVisible();
      await expect(note).toHaveCount(0);
      await showOverdue();
      await expect(row(unpaid)).toHaveCount(0);
      await page.goto(`/invoice/${unpaidToken}`);
      await expect(page.getByRole("heading", { level: 1, name: `Invoice ${unpaid}` })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(note).toHaveCount(0);
    });

    await test.step("09:00 in New York on D+1: overdue everywhere", async () => {
      await page.clock.setFixedTime(newYorkAt(nextDay(due), 9));
      const unpaidPage = await openFromList(unpaid);
      await page.goto(unpaidPage);
      const shown = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const dueText = shown.format(new Date(`${due}T12:00:00Z`));
      await expect(note).toBeVisible();
      await expect(note).toContainText(dueText);
      await page.goto(`/invoice/${unpaidToken}`);
      await expect(note).toBeVisible();
      await showOverdue();
      await expect(row(unpaid)).toHaveCount(1);
    });

    await test.step("a paid invoice says Paid on and never the overdue note, at either clock", async () => {
      for (const at of [newYorkAt(due, 20), newYorkAt(nextDay(due), 9)]) {
        await page.clock.setFixedTime(at);
        await page.goto(await openFromList(paid));
        await expect(page.getByText(/^Paid on .+ Thank you\.$/).first()).toBeVisible();
        await page.goto(`/invoice/${paidToken}`);
        await expect(page.getByText(/^Paid on .+ Thank you\.$/)).toBeVisible();
        await page.waitForLoadState("networkidle");
        await expect(note).toHaveCount(0);
      }
    });
  });
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
