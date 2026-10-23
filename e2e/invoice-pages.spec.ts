import { expect, sql, startDemo, test } from "./helpers";

/** The invoices sit in one card with a header; a phone shows 3 at a time, a wide screen 10, with Previous and Next. */
test("invoices are in one headed card and paginated: 3 per page on a phone, 10 on a wide screen", async ({
  page,
}, info) => {
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
  await expect(card.getByRole("heading", { name: "Your invoices" })).toBeVisible();
  const numbers = () => card.getByText(/^INV-\d{4}-\d{3}$/);

  if (info.project.name === "phone") {
    const pager = card.getByRole("navigation", { name: "invoices pages" });
    const total = Number((await pager.innerText()).match(/of (\d+) invoices/)?.[1]);
    expect(total).toBe(11);
    await expect(numbers()).toHaveCount(3);
    await expect(pager).toContainText(`1 to 3 of ${total} invoices`);
    await expect(pager.getByRole("button", { name: "Previous" })).toBeDisabled();
    const firstPage = await numbers().allInnerTexts();
    await pager.getByRole("button", { name: "Next" }).click();
    await expect(pager).toContainText(`4 to ${Math.min(6, total)} of ${total} invoices`);
    const secondPage = await numbers().allInnerTexts();
    expect(secondPage.filter((n) => firstPage.includes(n))).toEqual([]);
    await pager.getByRole("button", { name: "Previous" }).click();
    expect(await numbers().allInnerTexts()).toEqual(firstPage);
  } else {
    // A wide screen shows ten at once, then the eleventh on page 2.
    await expect(numbers()).toHaveCount(10);
    const pager = card.getByRole("navigation", { name: "invoices pages" });
    await expect(pager).toContainText("1 to 10 of 11 invoices");
    await pager.getByRole("button", { name: "Next" }).click();
    await expect(numbers()).toHaveCount(1);
    await expect(pager).toContainText("11 to 11 of 11 invoices");
    await expect(pager.getByRole("button", { name: "Next" })).toBeDisabled();
  }
});

test("an invoice says its state in words, unpaid ones have Mark paid, and the tabs narrow the list", async ({
  page,
}) => {
  await startDemo(page);
  await page.goto("/dashboard/invoices");

  const card = page.getByRole("region", { name: "Your invoices" });
  const invoices = card.getByRole("listitem");
  await expect(invoices.first()).toBeVisible();
  const all = await invoices.count();
  expect(all).toBeGreaterThanOrEqual(2); // the sample data has a paid and an unpaid invoice
  // the state is in words beside the amount: Paid Oct 20, Due in 5 days, 3 days late, Due today, Waiting
  for (const row of await invoices.all())
    await expect(row).toContainText(/Paid \w{3} \d+|Due in \d+ days?|\d+ days? late|Due today|Waiting/);
  // the number is a button that downloads the PDF
  await expect(invoices.first().getByRole("button", { name: /^INV-\d{4}-\d{3}: download the PDF$/ })).toBeVisible();

  await test.step("the tabs: All is chosen, Paid shows only paid ones, Waiting only unpaid ones", async () => {
    const tabs = page.getByRole("tablist", { name: "Show invoices" });
    await expect(tabs.getByRole("tab", { name: /^All/ })).toHaveAttribute("aria-selected", "true");
    await tabs.getByRole("tab", { name: /^Paid/ }).click();
    await expect(tabs.getByRole("tab", { name: /^Paid/ })).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => invoices.count()).toBeLessThan(all);
    for (const row of await invoices.all()) {
      await expect(row).toContainText(/Paid \w{3} \d+/);
      await expect(row.getByRole("button", { name: "Mark paid" })).toHaveCount(0);
    }
    await tabs.getByRole("tab", { name: /^Waiting/ }).click();
    await expect.poll(() => invoices.count()).toBeGreaterThan(0);
    for (const row of await invoices.all()) await expect(row.getByRole("button", { name: "Mark paid" })).toBeVisible();
    await tabs.getByRole("tab", { name: /^All/ }).click();
    await expect.poll(() => invoices.count()).toBe(all);
  });

  await test.step("Mark paid opens its panel under the invoice and closes on a second press", async () => {
    const mark = card.getByRole("button", { name: "Mark paid" }).first();
    await expect(mark).toHaveAttribute("aria-expanded", "false");
    await mark.click();
    await expect(mark).toHaveAttribute("aria-expanded", "true");
    await mark.click();
    await expect(mark).toHaveAttribute("aria-expanded", "false");
  });

  // there are no folded filters any more: one search box
  await expect(page.getByRole("button", { name: "Filters" })).toHaveCount(0);
  await expect(
    page.getByRole("searchbox", { name: "Search invoices" }).or(page.getByLabel("Search invoices")),
  ).toBeVisible();
});
