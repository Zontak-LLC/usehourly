import { anonymous, clearMail, expect, linkIn, mailTo, newUser, seen, sql, startFreshAccount, test } from "./helpers";

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
    await page.getByRole("button", { name: "Acme Studio", pressed: false }).click(); // a toggle button, not a tick box
    await page.getByRole("button", { name: "Send the invitation" }).click();
    await expect(page.getByText(`We emailed ${member.email}.`)).toBeVisible();
    await expect(page.getByText(/Invitation sent, not accepted yet/)).toBeVisible();

    const mail = await mailTo(member.email, /invited you to a team/);
    expect(mail.html).toContain("Join the team"); // the button; the plain-text part carries the bare link
    expect(mail.text).not.toMatch(/\$\d/); // no rates or money in it
    joinPath = new URL(linkIn(mail.text, "/team/join/")).pathname;
  });

  await test.step("the Invite someone card sits beside one person and spans the row under two, so there is never empty space", async () => {
    await page.getByRole("button", { name: "Done" }).click(); // closes the sent-invitation message and shows the card again
    const people = page.getByRole("region", { name: "Your team" });
    const cell = () =>
      people.getByRole("button", { name: "Invite someone", exact: true }).locator("xpath=ancestor::li[1]");
    await expect(cell()).not.toHaveClass(/sm:col-span-2/); // one person: the card shares the row with them
    await expect(people.getByRole("button", { name: "Acme Studio", pressed: true })).toHaveCount(1); // the person's clients are toggle buttons, pressed when allowed
    // The pressed pill follows the theme: its check mark has the pill's own text colour (not the global green), and the
    // pill is filled with the soft tint rather than solid black.
    const pill = people.getByRole("button", { name: "Acme Studio", pressed: true });
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
    await shot("team-one-person");
    await people.getByRole("button", { name: "Invite someone", exact: true }).click();
    const form = page.locator("form", { has: page.getByLabel("Their email address") });
    await expect(form.locator("xpath=ancestor::li[1]")).not.toHaveClass(/sm:col-span-2/); // the form opens in the card's own cell
    await form.getByLabel("Their email address").fill(newUser().email);
    await form.getByRole("button", { name: "Acme Studio", pressed: false }).click();
    await page.getByRole("button", { name: "Send the invitation" }).click();
    await expect(page.getByText(/Invitation sent, not accepted yet/)).toHaveCount(2);
    await expect(form.locator("xpath=ancestor::li[1]")).not.toHaveClass(/sm:col-span-2/); // sending did not make the cell jump wider
    await page.getByRole("button", { name: "Done" }).click();
    await expect(cell()).toHaveClass(/sm:col-span-2/); // two people: the slim card spans both columns
    await shot("team-two-people");
    if (info.project.name === "phone") {
      // On a phone the people are a row to swipe through, one card at a time with the next one peeking in.
      const row = people.getByRole("list").first();
      expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      const first = await people.getByRole("listitem").first().boundingBox();
      const viewport = page.viewportSize()?.width ?? 400;
      const rowBox = await row.boundingBox();
      expect((first?.width ?? 0) >= (rowBox?.width ?? 999) - 2).toBe(true); // a card fills the whole width, no piece of the next one
      expect((first?.width ?? 0) <= viewport).toBe(true);
      await row.evaluate((el) => el.scrollTo({ left: 0 })); // back to the first card, as a visitor first sees it
      await shot("team-swipe-row-start");
      // Dots show where you are and jump to a card: the last one is the invite card.
      await expect(people.getByRole("button", { name: "Go to person 1 of 2" })).toHaveAttribute("aria-current", "true");
      await people.getByRole("button", { name: "Go to Invite someone" }).click();
      await expect(people.getByRole("button", { name: "Invite someone", exact: true })).toBeInViewport();
      await expect(people.getByRole("button", { name: "Go to Invite someone" })).toHaveAttribute(
        "aria-current",
        "true",
      );
      await expect(page).toHaveURL(/\/dashboard\/team$/);
      await shot("team-swipe-row");
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
    const pat = page.locator("li", { has: page.getByRole("heading", { name: /^Pat/ }) });
    await pat.getByRole("button", { name: "Remove", exact: true }).click();
    await pat.getByRole("button", { name: "Yes, remove" }).click();
    await expect(page.getByRole("heading", { name: /^Pat/ })).toHaveCount(0); // the other invitation (still pending) stays
    await patPage.reload();
    await expect(patPage.getByText(/Log time for/)).toHaveCount(0);
    await page.goto("/dashboard/today");
    await expect(page.getByText("Pat built the header")).toBeVisible();
  });
  await pat.close();
});
