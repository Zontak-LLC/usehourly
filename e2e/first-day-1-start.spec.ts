import { expect, newUser, seen, test } from "./helpers";

/**
 * A new freelancer's first day, part 1 of 4: sign up, say who you work for, log time, fix a mistake, look at the week
 * and the month. The parts run side by side (issue 331); each makes its own account. This is the only part that signs
 * up through the real page and answers the first-run question by hand; the others start from that state through the
 * API (`seedFirstDay`). Every step takes a screenshot and runs the standard checks.
 *
 * `actions` counts what the person has to do (clicks and typed fields) so the effort for each job is a number that can be
 * compared from run to run, and held to a budget where one matters. A job that gets harder to do shows up here.
 */
test("a new freelancer's first day: start", async ({ page, shot, audit, a11y, isPhone }, info) => {
  const user = newUser();
  const actions = { signup: 0, firstEntry: 0 };
  const count = (job: keyof typeof actions, n = 1) => {
    actions[job] += n;
  };

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
    await expect(page.locator("form").getByText("General · Acme Studio")).toBeVisible(); // "on General · Acme Studio": the only project
  });

  await test.step("log the first entry by typing a time", async () => {
    await page.getByLabel("Time to add").fill("1:30");
    await expect(page.getByText("Day total 0:00 → 1:30 h")).toBeVisible(); // the live preview
    await page.getByLabel("Description").fill("Logo concepts for the homepage");
    await page.getByRole("button", { name: /Log time/ }).click();
    count("firstEntry", 3);
    await expect(page.getByText("Logo concepts for the homepage")).toBeVisible();
    await expect(page.getByText(/Ready to get paid/)).toHaveCount(0); // no invoice nudge on Today
    await shot("first-entry");
    await audit("today with an entry");
    await a11y("today");
  });

  await test.step("log a second entry with a quick-pick chip", async () => {
    await page.getByRole("button", { name: "1 hour", exact: true }).click();
    await expect(page.getByLabel("Time to add")).toHaveValue("1h");
    await page.getByRole("button", { name: /Log time/ }).click();
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
    // A card the server has not confirmed yet is replaced when it is, and that closes the form: so click again until it is open.
    const timeBox = page.getByLabel("Time", { exact: true });
    await expect(async () => {
      if (!(await timeBox.isVisible())) await edit.click({ force: true });
      await expect(timeBox).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    await timeBox.fill("2:00");
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

  // The effort budget: how many actions each job took. Printed every run; the limits catch a job getting harder.
  test.info().annotations.push({ type: "effort", description: JSON.stringify(actions) });
  console.log(`[effort ${info.project.name}] ${JSON.stringify(actions)}`);
  expect.soft(actions.signup, "actions to sign up from the landing page").toBeLessThanOrEqual(6);
  expect.soft(actions.firstEntry, "actions from signing up to the first entry logged").toBeLessThanOrEqual(6);
});
