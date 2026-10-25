import { FEATURES } from "../src/lib/features";
import { clearMail, expect, gotoClient, linkIn, mailTo, seedFirstDay, test } from "./helpers";

/**
 * A new freelancer's first day, part 2 of 4: with 3 hours logged and no rate yet, an invoice is blocked with the way out,
 * the rate (and a budget) is set on Clients, the email address is confirmed from the mail, and each page is named like
 * its menu entry. It starts from part 1's end state, made through the API (issue 331).
 */
test("a new freelancer's first day: rate", async ({ page, shot, audit, isPhone }) => {
  const { user } = await seedFirstDay(page, { rate: 0, minutes: [120, 60] });

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
    await gotoClient(page, "Acme Studio"); // the split view: on a phone the client is picked from the list first
    await expect(page.getByRole("heading", { name: "Clients", level: 1 })).toBeVisible();
    await expect(page.getByText("No hourly rate yet")).toBeVisible(); // a missing rate is visible, not silent
    await shot("my-work-before");
    await page.getByRole("button", { name: "Edit General" }).click();
    await page.getByLabel("Rate per hour").fill("60");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("$60.00/h").first()).toBeVisible();
    await audit("my work");
    await shot("my-work-after");
  });

  await test.step("give the project a monthly budget: the bar shows on Clients and above the add form", async () => {
    if (!FEATURES.budgets) return; // hidden in this release (src/lib/features.ts)
    await gotoClient(page, "Acme Studio");
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
    await gotoClient(page, "Acme Studio");
    await page.getByRole("button", { name: "Edit General" }).click();
    await page.getByLabel("Budget amount").fill("");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("$60.00/h").first()).toBeVisible();
    await expect(page.getByText(/Budget: /)).toBeHidden();
  });

  await test.step("confirm the email address (from the email the app sent)", async () => {
    await page.goto("/dashboard/account#account");
    await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
    await audit("account");
    await shot("account");
    // Sign-up already sent one confirmation link; asking again replaces it, so wait for the NEW message only.
    await clearMail(user.email);
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
      ["Year", /^Year summary/, /^Year summary/],
      ["Account", /^Account$/, /^Account/],
    ];
    for (const [menu, heading, title] of pages) {
      if (menu === "Account") {
        // Account lives in the account menu at the top right (issue 217: the tabs are the six pages).
        await page.getByRole("button", { name: /^Account menu for/ }).click();
        await page.getByRole("menuitem", { name: "Account", exact: true }).click();
      } else {
        // Invoices, Clients and Year are tabs in the top strip.
        await page
          .getByRole("navigation", { name: "Main pages" })
          .getByRole("link", { name: menu, exact: true })
          .click();
      }
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page).toHaveTitle(title);
    }
  });
});
