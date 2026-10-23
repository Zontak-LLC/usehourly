import { expect, startDemo, startFreshAccount, test } from "./helpers";

test("a client is a card with its projects always in view, and Make invoice when the month has billable time", async ({
  page,
}) => {
  await startDemo(page);
  await page.goto("/dashboard/clients");

  // Northwind Studio has two projects in the sample data: both in view at once, nothing to open.
  const northwind = page.getByRole("region", { name: "Northwind Studio" });
  await expect(northwind.getByRole("heading", { name: "Northwind Studio", level: 2 })).toBeVisible();
  await expect(northwind.getByText("Website redesign")).toBeVisible();
  await expect(northwind.locator("[aria-expanded]").filter({ hasText: "Northwind Studio" })).toHaveCount(0); // no fold
  // the line under the name: projects, this month's time and what it is worth
  await expect(northwind).toContainText(/2 projects · \d+:\d\d · \$[\d,]+\.\d\d this month/);

  // the month has billable time, so the card offers an invoice for this client
  const invoice = northwind.getByRole("link", { name: "Make an invoice for Northwind Studio" });
  await expect(invoice).toHaveAttribute("href", /^\/dashboard\/invoices\/new\?client=[\w-]+$/);

  // On a wide screen a project is ONE line: its name and its one button sit at the same height.
  if ((page.viewportSize()?.width ?? 0) >= 640) {
    const line = northwind.getByRole("listitem").filter({ hasText: "Website redesign" }).first();
    const name = await line.getByText("Website redesign").boundingBox();
    const edit = await line.getByRole("button", { name: "Edit Website redesign" }).boundingBox();
    expect(Math.abs((name?.y ?? 0) - (edit?.y ?? 99))).toBeLessThan(30);
    await expect(line.getByRole("button")).toHaveCount(1); // Edit only: archiving lives in the edit form
  }

  // Make invoice opens the builder on that client.
  await invoice.click();
  await expect(page).toHaveURL(/dashboard\/invoices\/new\?client=/);
  await expect(page.getByLabel("Client")).toHaveValue(
    (await page.getByLabel("Client").locator("option", { hasText: "Northwind Studio" }).getAttribute("value")) ?? "",
  );
});

test("a client with no billable time this month has no Make invoice, and one with no projects says how to start", async ({
  page,
}) => {
  await startFreshAccount(page, "Fable Labs");
  await page.goto("/dashboard/clients");
  const fable = page.getByRole("region", { name: "Fable Labs" });
  await expect(fable).toContainText("1 project · 0:00 this month");
  await expect(fable.getByRole("link", { name: /Make an invoice/ })).toHaveCount(0);

  await page.getByRole("button", { name: "New client" }).click();
  await page.getByLabel("New client name").fill("Empty Co");
  await page.getByRole("button", { name: "Add client" }).click();
  const empty = page.getByRole("region", { name: "Empty Co" });
  await expect(empty).toContainText("No projects yet. Use Add project to start logging time for Empty Co.");
  const add = empty.getByRole("button", { name: "Add a project for Empty Co" });
  await add.click();
  await expect(add).toHaveAttribute("aria-expanded", "true");
  await expect(empty.getByText("New project for Empty Co")).toBeVisible();
  await expect(empty).not.toContainText("No projects yet");
  await empty.getByRole("button", { name: "Cancel" }).first().click();
  await expect(add).toHaveAttribute("aria-expanded", "false");
});

test("a long list of projects is cut after four, with Show all", async ({ page }) => {
  await startFreshAccount(page, "Fable Labs");
  await page.goto("/dashboard/clients");
  const fable = page.getByRole("region", { name: "Fable Labs" });
  await expect(fable.getByText("General", { exact: true })).toBeVisible();
  for (const name of ["P2", "P3", "P4", "P5", "P6"]) {
    await fable.getByRole("button", { name: "Add a project for Fable Labs" }).first().click();
    await fable.getByLabel("Project name").fill(name);
    await fable.getByRole("button", { name: "Add", exact: true }).click();
    // Past four projects the new one is behind "Show all", so wait for the count to say it arrived.
    if (name <= "P4") await expect(fable.getByText(name, { exact: true })).toBeVisible();
    else
      await expect(
        fable.getByRole("button", { name: `Show all ${["P2", "P3", "P4", "P5", "P6"].indexOf(name) + 2} projects` }),
      ).toBeVisible();
  }
  await page.reload();
  const show = page.getByRole("region", { name: "Fable Labs" }).getByRole("button", { name: "Show all 6 projects" });
  await expect(show).toBeVisible();
  await show.click();
  await expect(page.getByRole("region", { name: "Fable Labs" }).getByText("P6", { exact: true })).toBeVisible();
});
