import type { Page } from "@playwright/test";

import { expect, gotoClient, hold, newUser, refuse, seen, signUpByApi, test } from "./helpers";

/** The line under Log time after a save ("Logged 2:00 on General · Acme Studio"), or after Undo ("Undone…"). */
const savedLine = (page: Page, starts = "Logged ") =>
  page
    .getByRole("region", { name: /Log time/ })
    .getByRole("status")
    .filter({ hasText: new RegExp(`^${starts}`) });
const undoButton = (page: Page) => page.getByRole("button", { name: "Undo", exact: true });
/** The one-time line after first run ("Acme Studio is your first client, …"). */
const welcomeLine = (page: Page) => page.getByRole("status").filter({ hasText: "is your first client" });

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

  await test.step("add the first client (the first-run card), its project left empty", async () => {
    // Userbrain 2026-11-05: "Who do you work for?" was not read as adding a client; it now says so.
    await expect(page.getByLabel("Your first client")).toBeVisible();
    await expect(page.getByLabel("First project (optional)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add client" })).toBeVisible();
    await expect(page.getByText("Who do you work for?")).toHaveCount(0);
    // Nothing to total or point at yet: no "type a time above" with nothing above, no 0:00 tiles.
    await expect(page.getByText(/Welcome! Let's get your first hours logged/)).toBeVisible();
    await expect(page.getByText(/Type a time above/)).toBeHidden();
    await expect(page.getByText("Total hours this week", { exact: true })).toBeHidden();
    await shot("first-run");
    await audit("first run");
    await page.getByLabel("Your first client").fill("Acme Studio");
    // The rate is asked here, optional, so the first invoice is not $0 (issue 431).
    await expect(page.getByText("Optional. Invoices use it: hours × rate. You can set it later.")).toBeVisible();
    await page.getByLabel("Your hourly rate").fill("60");
    await page.getByRole("button", { name: "Add client" }).click();
    count("firstEntry", 3);
    await expect(page.getByLabel("Time to add")).toBeVisible();
    await expect(page.locator("form").getByText("General · Acme Studio")).toBeVisible(); // "on General · Acme Studio": the only project
    await expect(welcomeLine(page)).toHaveText(
      "Acme Studio is your first client, with the project General. Set a rate or add projects on Clients.",
    );
    await expect(welcomeLine(page).getByRole("link", { name: "Clients" })).toHaveAttribute(
      "href",
      /^\/dashboard\/clients\/[^/]+$/,
    );
    await shot("first-client-line");
  });

  await test.step("log 2:00: a plain line says it is saved, only once the server has it", async () => {
    await hold(page, "entry.create", 4000); // as long as instant-changes.spec.ts: a slow CI container still checks in time
    await page.getByLabel("Time to add").fill("2:00");
    await page.getByRole("button", { name: /Log time/ }).click();
    count("firstEntry", 2);
    await expect(page.locator("[data-entry-id]")).toHaveCount(1); // the row shows at once
    await expect(savedLine(page)).toHaveCount(0); // but not the line: Undo would have nothing to delete yet
    await page.unroute("**/api/trpc/entry.create*");
    await expect(savedLine(page)).toHaveText("Logged 2:00 on General · Acme Studio");
    await expect(undoButton(page)).toBeVisible();
    await expect(page.locator("[data-just-logged]")).toHaveCount(1); // the new row has a marked edge
    await expect(welcomeLine(page)).toHaveCount(0); // the one-time line ends with the first entry
    await expect(page.getByRole("navigation", { name: "Days" })).toContainText("2:00");
    await shot("saved-line");
    await audit("today with the saved-time line");
  });

  await test.step("Undo refused by the server: the row and the Undo button stay", async () => {
    await refuse(page, "entry.delete", "Couldn't undo that time.", 1);
    await undoButton(page).click();
    await expect(page.getByText("Couldn't undo that time.")).toBeVisible();
    await expect(page.locator("[data-entry-id]")).toHaveCount(1);
    await expect(undoButton(page)).toBeVisible();
  });

  await test.step("Undo: the row goes, the day total goes back, and it is still gone after a reload", async () => {
    await undoButton(page).click();
    await expect(savedLine(page, "Undone")).toHaveText("Undone. Nothing was saved.");
    await expect(undoButton(page)).toHaveCount(0);
    await expect(page.locator("[data-entry-id]")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Days" })).not.toContainText("2:00");
    await page.reload();
    await expect(page.getByLabel("Time to add")).toBeVisible();
    await expect(page.locator("[data-entry-id]")).toHaveCount(0);
  });

  await test.step("log an entry with a description by typing a time", async () => {
    await page.getByLabel("Time to add").fill("1:30");
    await expect(page.getByText("= 1:30 · Day total 0:00 → 1:30 h")).toBeVisible(); // the live preview
    await page.getByLabel("Description").fill("Logo concepts for the homepage");
    await page.getByRole("button", { name: /Log time/ }).click();
    await expect(page.getByText("Logo concepts for the homepage")).toBeVisible();
    await expect(savedLine(page)).toHaveText("Logged 1:30 on General · Acme Studio");
    await expect(page.getByText(/Ready to get paid/)).toHaveCount(0); // no invoice nudge on Today
    await shot("first-entry");
    await audit("today with an entry");
    await a11y("today");
  });

  await test.step("log a second entry with a quick-pick chip", async () => {
    await page.getByRole("button", { name: "1 hour", exact: true }).click();
    await expect(savedLine(page)).toHaveCount(0); // tapping a chip ends the line
    await expect(page.locator("[data-just-logged]")).toHaveCount(0);
    await expect(page.getByLabel("Time to add")).toHaveValue("1h");
    await page.getByRole("button", { name: /Log time/ }).click();
    await expect(savedLine(page)).toHaveText("Logged 1:00 on General · Acme Studio"); // logging again: the new entry's line
    await expect(page.locator("[data-just-logged]")).toHaveCount(1);
    await page.getByLabel("Time to add").fill("1");
    await expect(savedLine(page)).toHaveCount(0); // typing a time ends it, and the row loses its mark
    await expect(page.locator("[data-just-logged]")).toHaveCount(0);
    await page.getByLabel("Time to add").fill("");
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

  await test.step("the first-run rate is on Clients, and a project added there gets its own rate", async () => {
    await gotoClient(page, "Acme Studio");
    await expect(page.getByText("$60.00/h").first()).toBeVisible();
    await expect(page.getByText("No hourly rate yet")).toHaveCount(0);
    await page.getByRole("button", { name: "Add a project for Acme Studio" }).first().click();
    await page.getByLabel("Project name").fill("Website");
    await expect(page.getByText("Optional. Invoices use it: hours × rate. You can set it later.")).toBeVisible();
    await page.getByRole("spinbutton", { name: "Rate per hour", exact: true }).fill("75");
    await shot("add-project-with-rate");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Website" }).getByText("$75.00/h")).toBeVisible();
  });

  await test.step("Log time starts on the project just made, and the time goes there", async () => {
    await page.goto("/dashboard/today");
    await expect(page.getByRole("radio", { name: /Website/ })).toBeChecked();
    await page.getByLabel("Time to add").fill("1:00");
    await page.getByRole("button", { name: /Log time/ }).click();
    const entry = page.getByRole("listitem").filter({ hasText: "Website" }).filter({ hasText: "1:00" });
    await expect(entry.first()).toBeVisible();
    await expect(seen(page, "4:00")).toBeVisible(); // 3:00 on General + 1:00 on Website
    await shot("logged-on-new-project");
  });

  // The effort budget: how many actions each job took. Printed every run; the limits catch a job getting harder.
  test.info().annotations.push({ type: "effort", description: JSON.stringify(actions) });
  console.log(`[effort ${info.project.name}] ${JSON.stringify(actions)}`);
  expect.soft(actions.signup, "actions to sign up from the landing page").toBeLessThanOrEqual(6);
  expect.soft(actions.firstEntry, "actions from signing up to the first entry logged").toBeLessThanOrEqual(6);
});

/** A new account on Today's first-run card, with the client (and the project, when given) typed and Add client pressed. */
async function firstRun(page: Page, client: string, project = "") {
  await signUpByApi(page);
  await page.goto("/dashboard/today");
  await page.getByLabel("Your first client").fill(client);
  if (project) await page.getByLabel("First project (optional)").fill(project);
  await page.getByRole("button", { name: "Add client" }).click();
}

/** The Clients list rows named `name` (one per client; the list and the profile are two screens on a phone). */
const clientRows = (page: Page, name: string) =>
  page
    .locator('a[href^="/dashboard/clients/"]')
    .filter({ has: page.getByText(name, { exact: true }) })
    .locator("visible=true");

test("first run: an empty project box gives General, a typed one names the first project", async ({ page }) => {
  await firstRun(page, "Northwind Bakery");
  await expect(page.locator("form").getByText("General · Northwind Bakery")).toBeVisible();

  await firstRun(page, "Northwind Bakery", "Website");
  await expect(page.locator("form").getByText("Website · Northwind Bakery")).toBeVisible();
  await expect(welcomeLine(page)).toHaveText(
    "Northwind Bakery is your first client, with the project Website. Set a rate or add projects on Clients.",
  );
  // Its Clients link opens that client's profile, where the project lives.
  await welcomeLine(page).getByRole("link", { name: "Clients" }).click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/[^/]+$/);
  const profile = page.getByRole("region", { name: "Northwind Bakery", exact: true });
  await expect(profile.getByRole("heading", { level: 2 })).toHaveText("Northwind Bakery");
  await expect(profile.getByText("Website", { exact: true }).locator("visible=true").first()).toBeVisible();
  await page.goto("/dashboard/clients");
  await expect(clientRows(page, "Northwind Bakery")).toHaveCount(1);
});

test("half-done first run: pressing Add client again after the project failed makes no second client", async ({
  page,
  isPhone,
}) => {
  test.skip(isPhone, "the rule is the same on a phone; the main journey covers the card there");
  await refuse(page, "project.create", "Couldn't save that project.", 1); // the client is saved, its project is not
  await firstRun(page, "Northwind Bakery");
  await expect(page.getByText("Couldn't save that project.")).toBeVisible();
  await page.getByRole("button", { name: "Add client" }).click(); // the person tries again
  await expect(page.getByLabel("Time to add")).toBeVisible();
  await page.goto("/dashboard/clients");
  await expect(clientRows(page, "Northwind Bakery")).toHaveCount(1);
  await expect(page.getByText(/1 client · 1 project/).first()).toBeVisible(); // the title line counts the account's all
});
