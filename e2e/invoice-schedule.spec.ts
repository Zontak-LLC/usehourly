import { expect, gotoClient, invoiceRows, menuAction, openInvoice, sql, startFreshAccount, test } from "./helpers";

/*
 * Get paid without chasing (issue 100): Acme is invoiced every month, so once a month is over and its time is not billed,
 * Invoices and Acme's bill bar say "<Month> invoice for Acme is due" and open the builder on that month; the prompt goes
 * once the invoice exists. An overdue invoice gets "Write a reminder", a polite email for my own mail app.
 */

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

test("a monthly client: the due prompt, the invoice from it, and a reminder once it is late", async ({ page }) => {
  const user = await startFreshAccount(page, "Acme");
  const now = new Date();
  const lastMonthFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthLast = new Date(now.getFullYear(), now.getMonth(), 0);
  const worked = iso(new Date(now.getFullYear(), now.getMonth() - 1, 10));
  const month = new Intl.DateTimeFormat("en-US", {
    month: "long",
    ...(lastMonthFirst.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(lastMonthFirst);
  const owner = `(SELECT id FROM auth_users WHERE email = '${user.email}')`;

  await test.step("Acme bills $100 an hour, with 2:30 logged last month", async () => {
    await gotoClient(page, "Acme"); // on a phone the list comes first
    await page.getByRole("button", { name: "Edit General" }).click();
    await page.getByLabel("Rate per hour").fill("100");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("$100.00/h").first()).toBeVisible();
    sql(
      `INSERT INTO time_entries (id, user_id, project_id, date, minutes, note, created_at, updated_at)
       SELECT lower(hex(randomblob(16))), p.user_id, p.id, '${worked}', 150, 'Design', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       FROM projects p WHERE p.user_id = ${owner}`.replace(/\s+/g, " "),
    );
  });

  await test.step("without a schedule nothing is due", async () => {
    await page.goto("/dashboard/invoices");
    await expect(page.getByRole("heading", { name: "Invoices", level: 1 })).toBeVisible();
    await expect(page.getByTestId("invoice-due")).toHaveCount(0);
  });

  await test.step("set Acme to every month under Billing details", async () => {
    await gotoClient(page, "Acme");
    await menuAction(page, "More actions for Acme", "Billing details");
    await page.getByLabel("Invoice this client").selectOption("month");
    await expect(page.getByText(/On the 1st, for the month before\. Next:/)).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Client updated.")).toBeVisible();
    await expect(page.getByTestId("bill-bar")).toContainText(`${month} invoice is due · $250.00`);
  });

  await test.step("Invoices says the month is due, and Make invoice bills exactly that month", async () => {
    await page.goto("/dashboard/invoices");
    const due = page.getByTestId("invoice-due");
    await expect(due).toHaveCount(1);
    await expect(due).toContainText(`${month} invoice for Acme is due`);
    await expect(due).toContainText("2:30 h · $250.00");
    await due.getByRole("link", { name: "Make the invoice for Acme" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/invoices/new\\?client=[^&]+&from=${iso(lastMonthFirst)}&to=${iso(lastMonthLast)}$`),
    );
    await expect(page.getByText("$250.00").first()).toBeVisible();
    await page.getByRole("button", { name: /Create invoice/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices$/);
    await expect(invoiceRows(page)).toHaveCount(1);
    await expect(page.getByTestId("invoice-due")).toHaveCount(0); // invoiced: the prompt is gone
  });

  await test.step("an overdue invoice: Write a reminder opens the email for my mail app", async () => {
    sql(`UPDATE invoices SET due_date = date('now', 'localtime', '-9 days') WHERE user_id = ${owner}`);
    await page.reload();
    await page.getByRole("tab", { name: /Overdue/ }).click();
    const { detail } = await openInvoice(page, 0);
    const reminder = detail.getByRole("button", { name: /^Write a reminder for INV-/ });
    await expect(reminder).toBeVisible();
    await expect(detail.getByRole("button", { name: /^Send INV-/ })).toHaveCount(0); // its place is the reminder's
    await reminder.click();
    // the reminder opens in the invoice's own pane, not under a list row
    const panel = detail.getByRole("region", { name: /^Write a reminder for INV-/ });
    await expect(panel.getByLabel("Subject")).toHaveValue(/^Reminder: Invoice INV-\S+ .*is overdue$/);
    const message = panel.getByLabel("Message");
    await expect(message).toHaveValue(/for \$250\.00, .* 9 days ago, and I have not received the payment yet/);
    const link = await panel.getByLabel("Invoice link").inputValue();
    await expect(message).toHaveValue(new RegExp(link));
    const href = (await panel.getByRole("link", { name: "Open in my email app" }).getAttribute("href")) ?? "";
    const body = new URL(href).searchParams.get("body") ?? "";
    expect(body).toContain("$250.00");
    expect(body).toContain("9 days ago");
    expect(body).toContain("\r\n"); // mailto line breaks are CRLF
  });
});
