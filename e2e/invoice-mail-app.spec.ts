import type { Page } from "@playwright/test";

import { anonymous, expect, menuAction, sql, startDemo, startFreshAccount, test } from "./helpers";

/*
 * Issue 227: the freelancer sends an invoice from their OWN mail app. The Send panel writes the email (To from the
 * client's Billing details, the amount, the due date, a private link) and opens it in the mail app; UseHourly never
 * sends anything itself.
 */
/** A new account with two hours at $100 an hour for Acme, invoiced, and Acme's address under Billing details. */
async function invoiceForAcme(page: Page) {
  const user = await startFreshAccount(page, "Acme");

  await page.goto("/dashboard/clients");
  await page.getByRole("button", { name: "Edit General" }).click();
  await page.getByLabel("Rate per hour").fill("100");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("$100.00/h").first()).toBeVisible();
  await page.goto("/dashboard/today");
  await page.getByLabel("Time to add").fill("2h");
  await page.getByRole("button", { name: /^Log time/ }).click();
  await expect(page.getByRole("navigation", { name: "Days" })).toContainText("2:00 this day");
  await page.goto("/dashboard/clients");
  await menuAction(page, "More actions for Acme", "Billing details");
  await page.getByLabel("Email for invoices").fill("accounts@client.example");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Client updated.")).toBeVisible();
  await page.goto("/dashboard/invoices/new");
  await page.getByRole("button", { name: /Create invoice/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/invoices$/);
  const first = page.getByRole("region", { name: "Your invoices" }).getByRole("listitem").first();
  const number = (await first.getByRole("link", { name: /: open the invoice$/ }).innerText()).trim();
  return { user, number };
}

test("Send writes the invoice email for my own mail app, with a private link that works", async ({
  page,
  browser,
  context,
}, info) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { number } = await invoiceForAcme(page);

  await test.step("the panel writes the email, ready to edit", async () => {
    await page.goto("/dashboard/invoices");
    await page.getByRole("button", { name: `Send ${number}` }).click();
    const panel = page.getByRole("region", { name: `Send invoice ${number}` });
    await expect(panel.getByLabel("To")).toHaveValue("accounts@client.example");
    await expect(panel.getByLabel("Subject")).toHaveValue(new RegExp(`^Invoice ${number}`));
    const link = await panel.getByLabel("Invoice link").inputValue();
    expect(link).toMatch(/\/invoice\/\S{40,}$/);
    const message = panel.getByLabel("Message");
    await expect(message).toHaveValue(new RegExp(`Here is invoice ${number} for \\$200\\.00`));
    await expect(message).toHaveValue(new RegExp(link));
    await expect(panel.getByRole("button", { name: "Send the email" })).toHaveCount(0); // nothing is sent from here

    // The mail app gets the address, the subject and the message as they are now, edits included.
    await message.fill("Hello Kirk,\nHere it is & thanks.");
    const href = (await panel.getByRole("link", { name: "Open in my email app" }).getAttribute("href")) ?? "";
    expect(href.startsWith("mailto:accounts@client.example?subject=")).toBe(true);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("subject")).toMatch(new RegExp(`^Invoice ${number}`));
    expect(params.get("body")).toBe("Hello Kirk,\r\nHere it is & thanks.");
    expect([...params.keys()]).toEqual(["subject", "body"]);

    await panel.getByRole("button", { name: "Copy message" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Hello Kirk,\nHere it is & thanks.");

    const download = page.waitForEvent("download");
    await panel.getByRole("button", { name: "Download PDF" }).click();
    expect((await download).suggestedFilename()).toBe(`${number}.pdf`);

    // The client opens the link.
    const anon = await anonymous(browser, info);
    const reader = await anon.newPage();
    await reader.goto(link);
    await expect(reader.getByRole("heading", { name: new RegExp(`Invoice ${number}`) })).toBeVisible();
    await anon.close();

    // Closing and opening the panel again keeps the same link: no second link is made.
    await panel.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: `Send ${number}` }).click();
    await expect(panel.getByLabel("Invoice link")).toHaveValue(link);
    const links = panel.getByRole("list", { name: "Links for this invoice" }).getByRole("listitem");
    await expect(links).toHaveCount(1);
    await expect(links.first()).toContainText("Works now");

    // Turning the link off stops it for the client.
    await links.first().getByRole("button", { name: "Turn off" }).click();
    await expect(links.first()).toContainText("Turned off");
    const anon2 = await anonymous(browser, info);
    const late = await anon2.newPage();
    await late.goto(link);
    await expect(late.getByText(/isn.t available any more/i)).toBeVisible();
    await anon2.close();

    // The email still held that link: the panel says so and writes it again with a fresh one.
    await panel.getByRole("button", { name: "Write it again with a new link" }).click();
    await expect(panel.getByLabel("Invoice link")).not.toHaveValue(link);
    const fresh = await panel.getByLabel("Invoice link").inputValue();
    await expect(panel.getByLabel("Message")).toHaveValue(new RegExp(fresh));
    await expect(links).toHaveCount(2);
  });
});

test("a demo account cannot share links: the email says the PDF is attached instead", async ({ page }) => {
  await startDemo(page);
  await page.goto("/dashboard/invoices");
  await page
    .getByRole("button", { name: /^Send INV-/ })
    .first()
    .click();
  const panel = page.getByRole("region", { name: /^Send invoice INV-/ });
  await expect(panel.getByText(/The email has no link, so attach the PDF yourself/)).toBeVisible();
  await expect(panel.getByLabel("Message")).toHaveValue(/The invoice is attached as a PDF\./);
  await expect(panel.getByLabel("Invoice link")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Download PDF" })).toBeEnabled();
});

test("at the live-link limit the panel says how to fix it, and writes the email again with a link", async ({
  page,
}) => {
  const { user, number } = await invoiceForAcme(page);
  await page.getByRole("button", { name: `Send ${number}` }).click();
  const panel = page.getByRole("region", { name: `Send invoice ${number}` });
  await expect(panel.getByLabel("Invoice link")).toBeVisible();
  // Four more live links for the same invoice: five in all, the most an invoice may have.
  sql(
    `WITH RECURSIVE n(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM n WHERE n < 4)
    INSERT INTO invoice_links (id, user_id, invoice_id, token_hash, token_prefix, expires_at, revoked_at, created_at)
    SELECT lower(hex(randomblob(16))), l.user_id, l.invoice_id, lower(hex(randomblob(32))), l.token_prefix, l.expires_at,
      NULL, l.created_at
    FROM (SELECT * FROM invoice_links WHERE user_id = (SELECT id FROM auth_users WHERE email = '${user.email}') LIMIT 1) l,
      n`.replace(/\s+/g, " "),
  );

  await page.reload(); // a new visit makes a new link, and this one is refused
  await page.getByRole("button", { name: `Send ${number}` }).click();
  await expect(panel.getByText(/already has 5 live links/)).toBeVisible();
  await expect(panel.getByLabel("Message")).toHaveValue(/The invoice is attached as a PDF\./);
  const links = panel.getByRole("list", { name: "Links for this invoice" }).getByRole("listitem");
  await expect(links).toHaveCount(5);

  await links.first().getByRole("button", { name: "Turn off" }).click();
  await expect(links.first()).toContainText("Turned off");
  await panel.getByRole("button", { name: "Try again with a link" }).click();
  const link = await panel.getByLabel("Invoice link").inputValue();
  expect(link).toMatch(/\/invoice\/\S{40,}$/);
  await expect(panel.getByLabel("Message")).toHaveValue(new RegExp(link));
  await expect(panel.getByText(/already has 5 live links/)).toHaveCount(0);
});
