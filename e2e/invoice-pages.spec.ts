import { expect, sql, test } from "./helpers";

/** The invoices sit in one card with a header; a phone shows 3 at a time, a wide screen 10, with Previous and Next. */
test("invoices are in one headed card and paginated: 3 per page on a phone, 10 on a wide screen", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
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
    const total = Number((await card.getByText(/^\d+ invoices? ·/).innerText()).match(/^(\d+)/)?.[1]);
    expect(total).toBe(11);
    await expect(numbers()).toHaveCount(3);
    const pager = card.getByRole("navigation", { name: "invoices pages" });
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

test("an invoice shows its status in its header, labelled buttons on a wide screen, and the filters start folded", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/dashboard/invoices");

  const first = page.getByRole("region", { name: "Your invoices" }).getByRole("listitem").first();
  // the status (Unpaid / Paid) is in the header line, next to the invoice number
  await expect(
    first
      .locator("div")
      .first()
      .getByText(/Unpaid|Paid/),
  ).toBeVisible();

  if (info.project.name === "desktop") {
    // words on the buttons, not bare icons
    await expect(
      first.getByRole("button", { name: /^(Mark|Edit payment|Send) /, includeHidden: false }).first(),
    ).toBeVisible();
    await expect(first.getByText("Send", { exact: true }).locator("visible=true")).toBeVisible();
  }

  // the filters are folded on every screen until Filters is pressed
  await expect(page.getByLabel("Issued from")).toBeHidden();
  await page.getByRole("button", { name: "Filters" }).click();
  await expect(page.getByLabel("Issued from")).toBeVisible();
  await page.getByRole("button", { name: "Filters" }).click();
  await expect(page.getByLabel("Issued from")).toBeHidden();
});
