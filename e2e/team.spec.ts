import { FEATURES } from "../src/lib/features";
import { anonymous, expect, linkIn, mailTo, menuAction, newUser, seen, sql, startFreshAccount, test } from "./helpers";

test.skip(!FEATURES.team, "Team is hidden in this release (src/lib/features.ts)");

/**
 * Teams, start to finish in real browsers: an owner invites a person by email, the email arrives (the mail stand-in
 * catches it), the person opens its link, joins, logs time on the client they were given, the owner sees that entry
 * marked with the person's name, and removing them cuts them off.
 */
test("an owner invites someone by email, they join and log time, and the owner removes them", async ({
  page,
  browser,
  shot,
}, info) => {
  const member = { ...newUser(), name: "Pat Assistant" };
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
    await page.getByRole("button", { name: "Invite someone" }).click(); // the empty-state button opens the form
    await expect(page.getByText("Nobody on your team yet")).toBeHidden();
    await page.getByLabel("Their email address").fill(member.email);
    await page.getByLabel("Their name (optional)").fill("Pat");
    await page.getByRole("button", { name: "Acme Studio", pressed: false }).click(); // a toggle button, not a tick box
    await page.getByRole("button", { name: "Send the invitation" }).click();
    await expect(page.getByText(`We emailed ${member.email}.`)).toBeVisible();
    await expect(page.getByText(/Invitation sent, waiting to accept/)).toBeVisible();

    const mail = await mailTo(member.email, /invited you to a team/);
    expect(mail.html).toContain("Join the team"); // the button; the plain-text part carries the bare link
    expect(mail.text).not.toMatch(/\$\d/); // no rates or money in it
    joinPath = new URL(linkIn(mail.text, "/team/join/")).pathname;
  });

  await test.step("people are rows in one list, and the + in the header invites another", async () => {
    await page.getByRole("button", { name: "Done" }).click(); // closes the sent-invitation message
    const people = page.getByRole("region", { name: "Your team" });
    await expect(people.getByRole("listitem")).toHaveCount(1);
    const allowed = people.getByText("Acme Studio", { exact: true });
    await expect(allowed).toBeVisible(); // small chips of words, not tick boxes
    // The pencil opens the client toggles in the row, and closes them again.
    const edit = people.getByRole("button", { name: "Edit clients for Pat" });
    await edit.click();
    await expect(edit).toHaveAttribute("aria-expanded", "true");
    const pill = people.getByRole("button", { name: "Acme Studio", pressed: true });
    await expect(pill).toHaveCount(1); // a toggle button, pressed when allowed
    // The pressed pill follows the theme: its check mark has the pill's own text colour (not the global green), and the
    // pill is filled with the soft tint rather than solid black.
    const colours = await pill.evaluate((el) => {
      const icon = el.querySelector("svg");
      return {
        text: getComputedStyle(el).color,
        icon: icon ? getComputedStyle(icon).color : null,
        fill: getComputedStyle(el).backgroundColor,
      };
    });
    expect(colours.icon).toBe(colours.text);
    expect(colours.fill).not.toBe("rgb(24, 24, 27)");
    await edit.click();
    await expect(allowed).toBeVisible();
    await shot("team-one-person");

    const plus = page.getByRole("button", { name: "Invite someone" });
    await plus.click();
    await expect(plus).toHaveAttribute("aria-expanded", "true");
    const form = page.locator("form", { has: page.getByLabel("Their email address") });
    const unnamed = newUser().email;
    await form.getByLabel("Their email address").fill(unnamed);
    await form.getByRole("button", { name: "Acme Studio", pressed: false }).click();
    await page.getByRole("button", { name: "Send the invitation" }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(people.getByRole("listitem")).toHaveCount(2);
    await expect(people.getByText(unnamed, { exact: true })).toHaveCount(1); // no name given: the address is the title and is not repeated under it
    await expect(people.getByText(/Invitation sent, waiting to accept/)).toHaveCount(2);
    await shot("team-two-people");
    if (info.project.name === "phone") {
      // No swipe row any more: the rows stack, and the page does not scroll sideways.
      await expect(people.getByRole("button", { name: /Go to person/ })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
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
    const lateEmail = newUser().email;
    await p2.getByLabel("Email", { exact: true }).fill(lateEmail);
    await p2.getByLabel("Password", { exact: true }).fill(member.password);
    await p2.getByRole("button", { name: "Create account" }).click();
    await expect(p2).toHaveURL(/dashboard\/today/);
    await p2.goto(joinPath);
    await expect(p2.getByText(`Signed in as ${lateEmail}`)).toBeVisible(); // the page says who is signed in
    await p2.getByRole("button", { name: "Join the team" }).click();
    await expect(p2.getByText(/This invitation isn't available/)).toBeVisible();
    // ...and offers the way out: log out and come straight back to the same invitation to sign in as someone else
    await p2.getByRole("button", { name: "Use a different account" }).click();
    await expect(p2).toHaveURL(
      new RegExp(`/auth/v2/login\\?next=${encodeURIComponent(joinPath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    await expect(p2.getByRole("button", { name: /Log in/ })).toBeVisible();
    await again.close();
  });

  await test.step("Pat logs time on the client Pat was given and sees only that", async () => {
    await patPage.goto("/dashboard/team");
    await expect(patPage.getByText(/Log time for/)).toBeVisible();
    await patPage.getByLabel("Time", { exact: true }).fill("1.5");
    await patPage.getByLabel("Description").fill("Pat built the header");
    await patPage.getByRole("button", { name: "Log time" }).click();
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
    await menuAction(page, "More actions for Pat", "Remove from team");
    await page.getByRole("region", { name: "Remove Pat?" }).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("heading", { name: /^Pat/ })).toHaveCount(0); // the other invitation (still pending) stays
    await patPage.reload();
    await expect(patPage.getByText(/Log time for/)).toHaveCount(0);
    await page.goto("/dashboard/today");
    await expect(page.getByText("Pat built the header")).toBeVisible();
  });
  await pat.close();
});
