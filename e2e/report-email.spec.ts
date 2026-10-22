import { clearMail, expect, mailTo, sql, startFreshAccount, test } from "./helpers";

/** The year summary can be emailed to yourself, once your address is confirmed. */
test("Email me this sends the year summary to your own confirmed address", async ({ page }) => {
  const user = await startFreshAccount(page);
  await page.getByPlaceholder(/Time:/).fill("2h");
  await page.getByRole("button", { name: /Log time/ }).click();
  await expect(page.getByText("2:00", { exact: true }).locator("visible=true").first()).toBeVisible();

  await test.step("an unconfirmed address is told to confirm first, and nothing is sent", async () => {
    await page.goto("/dashboard/report");
    await clearMail(user.email);
    await page.getByRole("button", { name: "Email me this" }).click();
    await expect(page.getByText(/Confirm your email address first/)).toBeVisible();
  });

  await test.step("once confirmed it goes to your own address with the figures in it", async () => {
    sql(
      `UPDATE auth_users SET email_verified_at = strftime('%Y-%m-%dT%H:%M:%f+00:00','now') WHERE email='${user.email}'`,
    );
    await page.reload();
    await clearMail(user.email);
    await page.getByRole("button", { name: "Email me this" }).click();
    await expect(page.getByText(`Sent to ${user.email}.`)).toBeVisible();
    const mail = await mailTo(user.email, /year summary/);
    expect(mail.subject).toMatch(/^Your \d{4} year summary \(USD\)$/);
    expect(mail.text).toContain("Logged");
    expect(mail.text).toMatch(/Logged\s+2\.00 h/);
    expect(mail.text).toContain("/dashboard/report");
  });
});
