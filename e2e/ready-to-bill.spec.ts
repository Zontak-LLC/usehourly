import {
  expect,
  makeInvoice,
  openEntryEdit,
  pastTimerLock,
  savedInvoices,
  seedFirstDay,
  startFreshAccount,
  test,
} from "./helpers";

// Money right (issue #178, 2026-10-23): a client shows what is not invoiced yet, Make invoice bills exactly that, and
// the same hours are never billed twice without asking.
test("not invoiced yet, make the invoice, and the same time is not billed twice", async ({ page }) => {
  await startFreshAccount(page, "Acme");

  await test.step("a rate and two hours of work", async () => {
    await page.goto("/dashboard/clients");
    await page.getByRole("button", { name: "Edit General" }).click();
    await page.getByLabel("Rate per hour").fill("100");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("$100.00/h").first()).toBeVisible();
    await page.goto("/dashboard/today");
    await page.getByLabel("Time to add").fill("2h");
    await page.getByRole("button", { name: /^Log time/ }).click();
    await expect(page.getByRole("navigation", { name: "Days" })).toContainText("2:00 this day");
  });

  const card = page.getByRole("region", { name: "Acme" });
  await test.step("the client shows what is not invoiced yet, with Make invoice", async () => {
    await page.goto("/dashboard/clients");
    await expect(card.getByTestId("bill-bar")).toContainText("$200.00 not invoiced"); // the bill bar (issue 238)
    await card.getByRole("link", { name: "Make an invoice for Acme" }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices\/new\?client=/);
    await expect(page.getByText("$200.00").first()).toBeVisible();
    await makeInvoice(page);
    await expect(page).toHaveURL(/\/dashboard\/invoices$/);
  });

  await test.step("once invoiced, nothing is left to bill and the entry says so", async () => {
    await page.goto("/dashboard/clients");
    await expect(card.getByRole("heading", { name: "Acme" })).toBeVisible();
    await expect(card.getByTestId("bill-bar")).toHaveCount(0); // all billed up: no bill bar
    await expect(card.getByRole("link", { name: "Make an invoice for Acme" })).toHaveCount(0);
    await page.goto("/dashboard/today");
    await expect(page.getByText("Invoiced", { exact: true }).first()).toBeVisible();
  });

  await test.step("a new invoice for the same time warns, and bills it again only when asked", async () => {
    await page.goto("/dashboard/invoices/new");
    // the same decimal hours as the preview, h:mm in brackets (one form on the screen, 2026-10-26)
    await expect(page.getByText(/2.00 h \(2:00\) of this client.s time in this period is already on/)).toBeVisible();
    const create = page.getByRole("button", { name: "Preview invoice" });
    await expect(create).toBeDisabled();
    await page.getByLabel("Bill it again anyway").check();
    await expect(page.getByText("$200.00").first()).toBeVisible();
    await expect(create).toBeEnabled();
  });
});

// Issue 448: time on an invoice stays as billed. Extra time goes into a new entry, so it can be billed too.
test("an invoiced entry keeps its time: a longer time is refused with the invoice number", async ({ page }) => {
  await seedFirstDay(page, { rate: 10000, minutes: [120] });
  await page.goto("/dashboard/invoices/new");
  await makeInvoice(page);
  await expect(page).toHaveURL(/\/dashboard\/invoices$/);
  const [invoice] = await savedInvoices(page);

  await page.goto("/dashboard/today");
  const card = await openEntryEdit(page);
  await card.getByLabel("Time", { exact: true }).fill("3:00");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText(`This entry is on invoice ${invoice.number}. Add a new entry for the extra time.`),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("navigation", { name: "Days" })).toContainText("2:00 this day");
});

test("Resume on an entry invoiced meanwhile starts a new entry, so the extra time can be billed", async ({ page }) => {
  await seedFirstDay(page, { rate: 10000, minutes: [] });
  await page.goto("/dashboard/today");
  const watch = page.getByRole("region", { name: "Timer" });
  await watch.getByRole("button", { name: /Start\s+timer/ }).click();
  await pastTimerLock(page);
  await watch.getByRole("button", { name: /Stop\s+timer/ }).click();
  await expect(watch.getByRole("group", { name: /Saved time/ })).toBeVisible();

  await test.step("in a second tab, the stopped time goes onto an invoice", async () => {
    const other = await page.context().newPage();
    await other.goto("/dashboard/invoices/new");
    await makeInvoice(other);
    await expect(other).toHaveURL(/\/dashboard\/invoices$/);
    await other.close();
  });

  await test.step("Resume runs a new timer from 0:00, and Stop leaves two rows", async () => {
    await pastTimerLock(page);
    await watch.getByRole("button", { name: /Resume\s+timer/ }).click();
    await expect(watch.getByRole("button", { name: /Stop\s+timer/ })).toBeVisible();
    await expect(watch.getByRole("timer")).toHaveAttribute("aria-label", /^Timer 0:00:\d\d$/); // a new entry, from 0
    await pastTimerLock(page);
    await watch.getByRole("button", { name: /Stop\s+timer/ }).click();
    await expect(watch.getByRole("group", { name: /Saved time/ })).toBeVisible();
    const sheet = page.getByRole("region", { name: "Today's entries" });
    await expect(sheet.getByRole("heading", { level: 2 })).toContainText("(2 entries)");
    await expect(sheet.getByText("Invoiced", { exact: true })).toHaveCount(1); // only the billed row
  });

  await test.step("the new time waits to be billed", async () => {
    await page.goto("/dashboard/clients");
    await expect(page.getByRole("region", { name: "Acme Studio" }).getByTestId("bill-bar")).toContainText(
      /\$[1-9][\d.,]* not invoiced/,
    );
  });
});
