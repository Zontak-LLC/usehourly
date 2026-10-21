import { anonymous, clearMail, clientEmail, expect, linkIn, mailTo, newUser, seen, sql, test, today } from "./helpers";
import { readFileSync } from "node:fs";

/**
 * A new freelancer's first day, start to finish, the way the product is meant to be used: sign up, say who you work for,
 * log time, fix a mistake, look at the week, set a rate, make an invoice and get it paid, share hours and an invoice with
 * a client, email an invoice, and finally delete the account. Every step takes a screenshot and runs the standard checks.
 *
 * `actions` counts what the person has to do (clicks and typed fields) so the effort for each job is a number that can be
 * compared from run to run, and held to a budget where one matters. A job that gets harder to do shows up here.
 */
test("a new freelancer's first day", async ({ page, browser, shot, audit, a11y, isPhone }, info) => {
  const user = newUser();
  const client = clientEmail();
  const actions = { signup: 0, firstEntry: 0, invoice: 0 };
  const count = (job: keyof typeof actions, n = 1) => {
    actions[job] += n;
  };
  await clearMail();

  await test.step("sign up from the landing page", async () => {
    await page.goto("/");
    await shot("landing");
    await audit("landing");
    await page
      .getByRole("link", { name: /create (a free |an )?account/i })
      .first()
      .click();
    count("signup");
    await expect(page).toHaveURL(/register/);
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible(); // the social buttons need the page's script
    await page.getByLabel("Name", { exact: true }).fill(user.name);
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    count("signup", 3);
    await audit("sign up");
    await shot("sign-up");
    await page.getByRole("button", { name: "Create account" }).click();
    count("signup");
    await expect(page).toHaveURL(/dashboard\/today/);
  });

  await test.step("say who you work for (the only first-run question)", async () => {
    await expect(page.getByText("Who do you work for?")).toBeVisible();
    // Nothing to total or point at yet: no "type a time above" with nothing above, no 0:00 tiles.
    await expect(page.getByText(/Welcome! Let's get your first hours logged/)).toBeVisible();
    await expect(page.getByText(/Type a time above/)).toBeHidden();
    await expect(page.getByText("Total hours this week", { exact: true })).toBeHidden();
    await shot("first-run");
    await audit("first run");
    await page.getByPlaceholder(/company or a person/i).fill("Acme Studio");
    await page.getByRole("button", { name: "Continue" }).click();
    count("firstEntry", 2);
    await expect(page.getByLabel("Time to add")).toBeVisible();
    await expect(page.getByText("Acme Studio · General")).toBeVisible();
  });

  await test.step("log the first entry by typing a time", async () => {
    await page.getByLabel("Time to add").fill("1:30");
    await expect(page.getByText("Day total 0:00 → 1:30 h")).toBeVisible(); // the live preview
    await page.getByLabel("Description").fill("Logo concepts for the homepage");
    await page.getByRole("button", { name: /Add to the day/ }).click();
    count("firstEntry", 3);
    await expect(page.getByText("Logo concepts for the homepage")).toBeVisible();
    await expect(page.getByText(/Ready to get paid/)).toBeVisible();
    await shot("first-entry");
    await audit("today with an entry");
    await a11y("today");
  });

  await test.step("log a second entry with a quick-pick chip", async () => {
    await page.getByRole("button", { name: "1 hour", exact: true }).click();
    await expect(page.getByLabel("Time to add")).toHaveValue("60m");
    await page.getByRole("button", { name: /Add to the day/ }).click();
  });

  await test.step("fix a mistake: change the first entry from 1:30 to 2:00", async () => {
    await page.getByText("Logo concepts for the homepage").hover(); // desktop shows the controls on hover
    // The entry is found by what it says (the newest entry is listed first, and one just added cannot be edited until
    // the server has confirmed it), not by its place in the list.
    const edit = page
      .getByRole("listitem")
      .filter({ hasText: "Logo concepts for the homepage" })
      .getByRole("button", { name: "Edit", exact: true });
    // On a phone there is no hover, so the controls have to be showing already. A miss here is a finding, not a crash.
    if (isPhone) await expect.soft(edit, "entry actions must be visible without hover on a phone").toBeVisible();
    await edit.click({ force: true });
    await page.getByLabel("Time", { exact: true }).fill("2:00");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(seen(page, "3:00")).toBeVisible(); // 1:00 + the 1:30 entry changed to 2:00
    await shot("edited");
  });

  await test.step("the week and month views show the day", async () => {
    await page.goto("/dashboard/week");
    await expect(page.getByRole("heading", { name: /weekly timesheet/i })).toBeVisible();
    await expect(seen(page, "3:00")).toBeVisible();
    await shot("week");
    await audit("week");
    await a11y("week");
    await page.goto("/dashboard/month");
    await expect(seen(page, "3:00")).toBeVisible();
    await shot("month");
    await audit("month");
  });

  await test.step("an invoice at a $0 rate is blocked, with the way out", async () => {
    await page.goto("/dashboard/invoices/new");
    await expect(page.getByText(/would be \$0\.00/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Create invoice/ })).toBeDisabled();
    // The way out is the link inside the warning itself, not the Clients tab in the menu.
    const wayOut = page.getByText(/would be \$0\.00/).getByRole("link", { name: "Clients" });
    await expect(wayOut).toHaveAttribute("href", "/dashboard/clients");
    await shot("invoice-blocked-at-zero");
  });

  await test.step("set the project's hourly rate under Clients", async () => {
    await page.goto("/dashboard/clients");
    await expect(page.getByRole("heading", { name: "Clients", level: 1 })).toBeVisible();
    await expect(page.getByText("No hourly rate yet")).toBeVisible(); // a missing rate is visible, not silent
    await shot("my-work-before");
    await page.getByRole("button", { name: "Edit General" }).click();
    await page.getByLabel("Rate per hour").fill("60");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("$60.00/h")).toBeVisible();
    await audit("my work");
    await shot("my-work-after");
  });

  await test.step("give the project a monthly budget: the bar shows on Clients and above the add form", async () => {
    await page.goto("/dashboard/clients");
    await page.getByRole("button", { name: "Edit General" }).click();
    await page.getByLabel("Budget amount").fill("100");
    await page.getByLabel("Budget unit").selectOption("dollars");
    await page.getByLabel("Budget period").selectOption("month");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    // 3 hours at $60/h = $180 so far: already past a $100 budget
    const over = "Budget: $180 of $100 this month · 180% · over budget";
    await expect(page.getByText(over)).toBeVisible();
    await shot("budget-on-clients");
    await audit("clients with a budget");

    await page.goto("/dashboard/today");
    await expect(page.getByText(over)).toBeVisible();
    await shot("budget-over");
    await audit("today, over budget");

    // a blank budget removes it again
    await page.goto("/dashboard/clients");
    await page.getByRole("button", { name: "Edit General" }).click();
    await page.getByLabel("Budget amount").fill("");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("$60.00/h")).toBeVisible();
    await expect(page.getByText(/Budget: /)).toBeHidden();
  });

  await test.step("confirm the email address (from the email the app sent)", async () => {
    await page.goto("/dashboard/account");
    await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
    await audit("account");
    await shot("account");
    // Sign-up already sent one confirmation link; asking again replaces it, so wait for the NEW message only.
    await clearMail();
    await page.getByRole("button", { name: /send me a confirmation email/i }).click();
    const mail = await mailTo(user.email, /Confirm your email/);
    expect(mail.html).toContain("<!doctype html>"); // styled version
    expect(mail.text).toContain("Please confirm this email address"); // plain-text version
    await page.goto(linkIn(mail.text, "/verify-email?token="));
    await expect(page.getByText(/confirmed|verified/i).first()).toBeVisible();
  });

  await test.step("each page is named like its menu entry", async () => {
    if (isPhone) return; // the phone menu is a drawer; the names are checked on desktop
    await page.goto("/dashboard/today");
    const pages: [menu: string, heading: RegExp, title: RegExp][] = [
      ["Invoices", /^Invoices$/, /^Invoices/],
      ["Clients", /^Clients$/, /^Clients/],
      ["Year summary (taxes)", /^Year summary/, /^Year summary/],
      ["Account", /^Account$/, /^Account/],
    ];
    for (const [menu, heading, title] of pages) {
      if (menu === "Year summary (taxes)") {
        // Rarely used, so it lives in the "More" menu of the top strip.
        await page.getByRole("button", { name: "More", exact: true }).click();
        await page.getByRole("menuitem", { name: menu, exact: true }).click();
      } else {
        // Invoices, Clients and Account are tabs in the top strip.
        await page
          .getByRole("navigation", { name: "Main pages" })
          .getByRole("link", { name: menu, exact: true })
          .click();
      }
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page).toHaveTitle(title);
    }
  });

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
    await page.getByRole("button", { name: /^Mark INV-.* as paid$/ }).click(); // the button on the card
    await page.getByLabel("Date the money arrived").fill(today());
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page
        .getByText(/^Paid\b/)
        .locator("visible=true")
        .first(),
    ).toBeVisible();
    await shot("invoice-paid");
    // A row offers four icon buttons with tooltips (money, send, PDF, delete) and no hidden menu.
    const controls = await page.getByTestId("invoice-actions").first().locator("button, a").count();
    expect.soft(controls, "controls on an invoice row").toBeLessThanOrEqual(4);
    await audit("invoices with one invoice");
    await a11y("invoices");
  });

  let invoiceUrl = "";
  await test.step("get a private link to the invoice and open it as the client", async () => {
    await page.getByRole("button", { name: /^Send INV-/ }).click();
    await page.getByRole("button", { name: "Make a link" }).click();
    invoiceUrl = await page.getByLabel("Invoice link").inputValue();
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

  await test.step("share the week for sign-off, the client approves, the owner is emailed", async () => {
    await clearMail();
    await page.goto("/dashboard/week");
    // The toolbar is the filter, one Share & export menu and the date arrows (usability pass #38).
    const toolbar = await page.getByTestId("timesheet-toolbar").locator("button:visible, select:visible").count();
    expect.soft(toolbar, "controls in the Week toolbar").toBeLessThanOrEqual(5);
    await page.getByRole("button", { name: /Share & export/ }).click();
    await shot("share-and-export-menu");
    await page.getByRole("menuitem", { name: /Send to a client for sign-off/ }).click();
    await shot("share-dialog");
    await page.getByRole("button", { name: "Make a link" }).click();
    const url = await page.getByLabel("Timesheet link").inputValue();
    const anon = await anonymous(browser, info);
    const sheet = await anon.newPage();
    await sheet.goto(url);
    await expect(seen(sheet, "3:00")).toBeVisible();
    await sheet.getByLabel("Your name").fill("Kirk Test");
    await sheet.getByRole("button", { name: "Approve these hours" }).click();
    await expect(sheet.getByText(/Approved by Kirk Test/)).toBeVisible();
    await sheet.screenshot({
      path: `e2e/report/screens/${info.project.name}/client-timesheet-approved.png`,
      fullPage: true,
    });
    await anon.close();
    const mail = await mailTo(user.email, /approved your timesheet/);
    expect(mail.subject).toBe("Kirk Test approved your timesheet");
    expect(mail.text).not.toContain(url); // the private link never goes in the email
  });

  await test.step("email the invoice to the client, who can read it and opt out", async () => {
    sql(
      `UPDATE auth_users SET created_at = strftime('%Y-%m-%dT%H:%M:%f+00:00','now','-3 days') WHERE email='${user.email}'`,
    );
    await page.goto("/dashboard/clients");
    await page.getByRole("button", { name: "Edit Acme Studio billing details" }).click();
    await page.getByLabel(/Email \(where you send invoices\)/).fill(client);
    await page.getByRole("button", { name: "Save client" }).click();
    await expect(page.getByText("Client updated.")).toBeVisible(); // wait for the save before leaving the page
    await page.goto("/dashboard/invoices");
    await clearMail();
    await page.getByRole("button", { name: /^Send INV-/ }).click();
    await expect(page.getByText("Loading…")).toBeHidden();
    await shot("email-panel");
    await page.getByLabel(/A note to include/).fill("Thanks for a great week.");
    await page.getByRole("button", { name: "Send the email" }).click();
    await expect(page.getByText(`Sent to ${client}`)).toBeVisible();
    const mail = await mailTo(client, /Invoice INV/);
    expect(mail.reply_to).toBe(user.email);
    expect(mail.from).toContain("Sam Freelancer via UseHourly");
    expect(mail.text).toContain("Thanks for a great week.");
    expect(mail.html).toContain("<!doctype html>");
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const anon = await anonymous(browser, info);
    const reader = await anon.newPage();
    await reader.goto(linkIn(mail.text, "/invoice/"));
    await expect(reader.getByRole("heading", { name: /Invoice INV-\d{4}-001/ })).toBeVisible();
    await reader.goto(linkIn(mail.text, "/stop-emails?"));
    await reader.getByRole("button", { name: "Yes, stop them" }).click();
    await expect(reader.getByText(/won.t send invoice emails to that address any more/i)).toBeVisible();
    await anon.close();
    // after opting out, the same button refuses
    await page.reload();
    await page.getByRole("button", { name: /^Send INV-/ }).click();
    await page.getByRole("button", { name: "Send the email" }).click();
    await expect(page.getByText(/asked not to get emails/i)).toBeVisible();
  });

  await test.step("the year summary shows the work", async () => {
    await page.goto("/dashboard/report");
    await expect(seen(page, "$180.00")).toBeVisible();
    await shot("year-summary");
    await audit("year summary");
  });

  await test.step("mark today non-billable (on the Week day card): it stays on screen, flagged, and the year summary leaves it out", async () => {
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
    await page.goto("/dashboard/account");
    await expect(page.getByText("Send invoices to your accounting app")).toBeVisible();
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

  await test.step("delete the account; the details no longer work", async () => {
    await page.goto("/dashboard/account");
    await page.getByRole("button", { name: /Delete my account/ }).click();
    await page.getByLabel(/Type your password/).fill(user.password);
    await page.getByRole("button", { name: "Delete everything" }).click();
    await expect(page).toHaveURL(/\/$|\/auth/);
    await page.goto("/auth/v2/login");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page
      .getByRole("button", { name: /log in|sign in/i })
      .first()
      .click();
    await expect(page.getByText("Wrong email or password.")).toBeVisible();
  });

  // The effort budget: how many actions each job took. Printed every run; the limits catch a job getting harder.
  test.info().annotations.push({ type: "effort", description: JSON.stringify(actions) });
  console.log(`[effort ${info.project.name}] ${JSON.stringify(actions)}`);
  expect.soft(actions.signup, "actions to sign up from the landing page").toBeLessThanOrEqual(6);
  expect.soft(actions.firstEntry, "actions from signing up to the first entry logged").toBeLessThanOrEqual(6);
  expect.soft(actions.invoice, "actions to make an invoice once there is logged time").toBeLessThanOrEqual(3);
});
