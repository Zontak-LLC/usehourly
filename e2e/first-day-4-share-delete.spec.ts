import { FEATURES } from "../src/lib/features";
import { anonymous, expect, mailTo, seedFirstDay, seen, test } from "./helpers";

/**
 * A new freelancer's first day, part 4 of 4: with 3 hours logged at $60/h (made through the API, issue 331), share the
 * week for sign-off, then delete the account and see the old details fail.
 */
test("a new freelancer's first day: share and delete", async ({ page, browser, shot }, info) => {
  const { user } = await seedFirstDay(page, { rate: 6000, minutes: [120, 60] });

  await test.step("share the week for sign-off, the client approves, the owner is emailed", async () => {
    await page.goto("/dashboard/week");
    // The toolbar is the date arrows, the filter and one Export menu (usability pass #38).
    const toolbar = await page.getByTestId("timesheet-toolbar").locator("button:visible, select:visible").count();
    expect.soft(toolbar, "controls in the Week toolbar").toBeLessThanOrEqual(5);
    if (!FEATURES.signOff) return; // sign-off links are hidden in this release (src/lib/features.ts)
    await page.getByRole("button", { name: /Share & export/ }).click();
    await shot("share-and-export-menu");
    await page.getByRole("menuitem", { name: /Send to a client for sign-off/ }).click();
    await shot("share-panel");
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

  await test.step("delete the account; the details no longer work", async () => {
    await page.goto("/dashboard/account#account");
    await page.getByRole("button", { name: /Delete my account/ }).click();
    await page.getByLabel(/Type your password/).fill(user.password);
    // Slide to delete (issue 210): the slider wakes up once the password is typed; End completes it.
    const slider = page.getByRole("slider", { name: "Slide to delete your account" });
    await expect(slider).not.toHaveAttribute("aria-disabled", "true");
    await slider.focus();
    await page.keyboard.press("End");
    await expect(page).toHaveURL(/\/account-deleted$/);
    await expect(page.getByRole("heading", { name: "Your account is deleted" })).toBeVisible();
    await page.goto("/auth/v2/login");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page
      .getByRole("button", { name: /log in|sign in/i })
      .first()
      .click();
    await expect(page.getByText("Wrong email or password.")).toBeVisible();
  });
});
