import type { Page } from "@playwright/test";

import {
  downloadEverythingZip,
  expect,
  invoiceRows,
  openInvoice,
  signUpByApi,
  sql,
  test,
  today,
  trpc,
} from "./helpers";

/*
 * Issue 451: the Invoices list holds the newest 200 invoices, but the money line, the tab counts, the Overdue tab and
 * "Download everything" must count EVERY invoice. An old unpaid invoice, older than the newest 200, is still chased.
 */

const LATE = "INV-LATE-001";
const PAID_COPIES = 220; // with the late one: 221 invoices, the late one the oldest

/**
 * A fresh account with one real $100 invoice (one hour at $100), made late and 400 days old, then 220 newer paid copies
 * of it (SQL: no person makes 220 invoices in a test). The late invoice is not among the newest 200.
 */
async function seedOldLateInvoice(page: Page) {
  const user = await signUpByApi(page);
  const client = await trpc<{ id: string }>(page, "clients.create", { name: "Old Debts Co" });
  const project = await trpc<{ id: string }>(page, "project.create", {
    clientId: client.id,
    name: "General",
    hourlyRate: 10_000,
  });
  const day = today();
  await trpc(page, "entry.create", { projectId: project.id, date: day, minutes: 60, note: "Audit" });
  await trpc(page, "invoice.create", { clientId: client.id, from: day, to: day, number: LATE, issueDate: day });
  const owner = `(SELECT id FROM auth_users WHERE email = '${user.email}')`;
  sql(
    `UPDATE invoices SET issue_date = date('now', 'localtime', '-400 days'),
      due_date = date('now', 'localtime', '-370 days') WHERE user_id = ${owner};
    WITH RECURSIVE n(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM n WHERE n < ${PAID_COPIES})
    INSERT INTO invoices (id, user_id, client_id, client_name, number, issue_date, due_date, paid_date, period_from,
      period_to, total_minutes, total_cents, currency, notes, snapshot, search_text, summary, remind_overdue,
      reminders_sent, created_at)
    SELECT lower(hex(randomblob(16))), i.user_id, i.client_id, i.client_name, 'INV-PAID-' || printf('%03d', n.n),
      date('now', 'localtime', '-' || n.n || ' days'), NULL, date('now', 'localtime', '-' || n.n || ' days'),
      i.period_from, i.period_to, i.total_minutes, i.total_cents, i.currency, i.notes, i.snapshot, i.search_text,
      i.summary, 0, 0, i.created_at
    FROM (SELECT * FROM invoices WHERE user_id = ${owner}) i, n`.replace(/\s+/g, " "),
  );
}

test("an old late invoice beyond the newest 200 is in the Overdue tab and the late figure, and leaves both once paid", async ({
  page,
}) => {
  await seedOldLateInvoice(page);
  await page.goto("/dashboard/invoices");
  const tabs = page.getByRole("tablist", { name: "Show invoices" });
  const overdueTab = tabs.getByRole("tab", { name: /^Overdue/ });
  const money = page.getByTestId("invoice-money");

  await test.step("the counts and the money line cover all 221 invoices", async () => {
    await expect(tabs.getByRole("tab", { name: /^All/ })).toHaveText(/All\s*221$/);
    await expect(overdueTab).toHaveText(/Overdue\s*1$/);
    await expect(money).toContainText("$22,000.00 paid"); // the newest 200 alone hold $20,000.00
    await expect(money).toContainText("$100.00 unpaid");
    await expect(money).toContainText("$100.00 late");
  });

  await test.step("the Overdue tab lists the old invoice; mark it paid", async () => {
    await page.evaluate(() => {
      (window as { notReloaded?: boolean }).notReloaded = true;
    });
    await overdueTab.click();
    await expect(invoiceRows(page)).toHaveCount(1);
    await expect(invoiceRows(page).first()).toHaveAttribute("data-number", LATE);
    const { detail } = await openInvoice(page, 0);
    await detail.getByRole("button", { name: "Mark paid" }).click();
    await page.getByLabel("Date the money arrived").fill(today());
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(detail.getByTestId("invoice-state")).toHaveText(/Paid \w{3} \d+/);
  });

  await test.step("without a reload, it leaves the Overdue tab and the late figure", async () => {
    await page.goBack(); // on a phone the list is the screen before the invoice; on a wide screen it is beside it
    await expect(page).toHaveURL(/\/dashboard\/invoices$/);
    await expect(overdueTab).toHaveText(/Overdue\s*0$/);
    await expect(invoiceRows(page)).toHaveCount(0);
    await expect(page.getByText("Nothing is late. Nice.")).toBeVisible();
    await expect(money).toContainText("$22,100.00 paid");
    await expect(money).not.toContainText("late");
    expect(await page.evaluate(() => (window as { notReloaded?: boolean }).notReloaded)).toBe(true);
  });
});

test("Download everything puts every invoice in invoices.csv, not only the newest 200", async ({ page }) => {
  await seedOldLateInvoice(page);
  await page.goto("/dashboard/account#data");
  const card = page.getByRole("region", { name: "Download everything" });
  await expect(card).toBeVisible();
  const zip = await downloadEverythingZip(page, card);
  const csv = (await zip.file("invoices.csv")?.async("string")) ?? "";
  const rows = csv.trim().split("\r\n").slice(1); // the first line is the header
  expect(rows).toHaveLength(PAID_COPIES + 1);
  expect(rows.filter((r) => r.startsWith(`${LATE},`))).toHaveLength(1);
});
