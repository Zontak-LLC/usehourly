import { anonymous, clearMail, expect, linkIn, mailTo, newUser, seen, sql, startFreshAccount, test } from "./helpers";

/**
 * Teams, start to finish in real browsers: an owner invites a person by email, the email arrives (the mail stand-in
 * catches it), the person opens its link, joins, logs time on the client they were given, the owner sees that entry
 * marked with the person's name, and removing them cuts them off.
 */
test("an owner invites someone by email, they join and log time, and the owner removes them", async ({
  page,
  browser,
}, info) => {
  const member = { ...newUser(), name: "Pat Assistant" };
  await clearMail();
  const owner = await startFreshAccount(page, "Acme Studio");

  await test.step("the owner's address is confirmed and the account is a few days old, so UseHourly may email for them", async () => {
    sql(
      `UPDATE auth_users SET email_verified_at = datetime('now'), created_at = strftime('%Y-%m-%dT%H:%M:%f+00:00','now','-3 days') WHERE email='${owner.email}'`,
    );
  });

  let joinPath = "";
  await test.step("the short address /team leads to the Team page", async () => {
    await page.goto("/team");
    await expect(page).toHaveURL(/\/dashboard\/team$/);
  });

  await test.step("the owner invites Pat on the Team page and the email goes out", async () => {
    await page.goto("/dashboard/team");
    await expect(page.getByRole("heading", { name: "Team", level: 1 })).toBeVisible();
    await expect(page.getByText("Nobody on your team yet")).toBeVisible();
    await page.getByRole("button", { name: /Invite someone/ }).click(); // the card turns into the form, in place
    await expect(page.getByText("Nobody on your team yet")).toBeHidden();
    await page.getByLabel("Their email address").fill(member.email);
    await page.getByLabel("Their name (optional)").fill("Pat");
    await page.getByLabel("Acme Studio").check();
    await page.getByRole("button", { name: "Send the invitation" }).click();
    await expect(page.getByText(`We emailed ${member.email}.`)).toBeVisible();
    await expect(page.getByText(/Invitation sent, not accepted yet/)).toBeVisible();

    const mail = await mailTo(member.email, /invited you to a team/);
    expect(mail.html).toContain("Join the team"); // the button; the plain-text part carries the bare link
    expect(mail.text).not.toMatch(/\$\d/); // no rates or money in it
    joinPath = new URL(linkIn(mail.text, "/team/join/")).pathname;
  });

  await test.step("someone not signed in who opens the link is sent to log in and brought back", async () => {
    const stranger = await anonymous(browser, info);
    const p = await stranger.newPage();
    await p.goto(joinPath);
    await expect(p).toHaveURL(
      new RegExp(`/auth/v2/login\\?next=${encodeURIComponent(joinPath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    await stranger.close();
  });

  const pat = await anonymous(browser, info);
  const patPage = await pat.newPage();
  await test.step("Pat signs up, opens the link and joins", async () => {
    await patPage.goto("/auth/v2/register");
    await patPage.getByLabel("Name", { exact: true }).fill(member.name);
    await patPage.getByLabel("Email", { exact: true }).fill(member.email);
    await patPage.getByLabel("Password", { exact: true }).fill(member.password);
    await patPage.getByRole("button", { name: "Create account" }).click();
    await expect(patPage).toHaveURL(/dashboard\/today/);
    await patPage.goto(joinPath);
    await patPage.getByRole("button", { name: "Join the team" }).click();
    await expect(patPage.getByRole("heading", { name: /You're on .* team/ })).toBeVisible();
    // the link is single use
    const again = await anonymous(browser, info);
    const p2 = await again.newPage();
    await p2.goto("/auth/v2/register");
    await p2.getByLabel("Name", { exact: true }).fill("Late Comer");
    await p2.getByLabel("Email", { exact: true }).fill(newUser().email);
    await p2.getByLabel("Password", { exact: true }).fill(member.password);
    await p2.getByRole("button", { name: "Create account" }).click();
    await expect(p2).toHaveURL(/dashboard\/today/);
    await p2.goto(joinPath);
    await p2.getByRole("button", { name: "Join the team" }).click();
    await expect(p2.getByText(/This invitation isn't available/)).toBeVisible();
    await again.close();
  });

  await test.step("Pat logs time on the client Pat was given and sees only that", async () => {
    await patPage.goto("/dashboard/team");
    await expect(patPage.getByText(/Log time for/)).toBeVisible();
    await patPage.getByLabel("Time", { exact: true }).fill("1.5");
    await patPage.getByLabel("Description").fill("Pat built the header");
    await patPage.getByRole("button", { name: "Add to the day" }).click();
    await expect(patPage.getByText("Pat built the header")).toBeVisible();
    await expect(patPage.getByRole("option", { name: "Acme Studio · General" })).toHaveCount(1); // only the granted client
  });

  await test.step("the owner sees Pat's entry on Today, marked with Pat's name", async () => {
    await page.goto("/dashboard/today");
    await expect(page.getByText("Pat built the header")).toBeVisible();
    await expect(seen(page, `by ${member.name}`)).toBeVisible();
  });

  await test.step("the owner removes Pat, who can no longer log time; the entry stays", async () => {
    await page.goto("/dashboard/team");
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("button", { name: "Yes, remove" }).click();
    await expect(page.getByText(/Invitation sent|On your team/)).toHaveCount(0);
    await patPage.reload();
    await expect(patPage.getByText(/Log time for/)).toHaveCount(0);
    await page.goto("/dashboard/today");
    await expect(page.getByText("Pat built the header")).toBeVisible();
  });
  await pat.close();
});
