import { expect, startFreshAccount, test } from "./helpers";

test("a client with several projects is a closed row that opens, and a long list is cut after four", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/dashboard/clients");

  // Northwind Studio has two projects in the sample data: closed to start, one click opens it.
  const northwind = page.getByRole("region", { name: "Northwind Studio" });
  const toggle = northwind.getByRole("button", { name: /Northwind Studio/ }).first();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(northwind.getByText("Website redesign")).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(northwind.getByText("Website redesign")).toBeVisible();

  // The choice is remembered on this device.
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Northwind Studio" })
      .getByRole("button", { name: /Northwind Studio/ })
      .first(),
  ).toHaveAttribute("aria-expanded", "true");
});

test("a client with one project starts open, and a long list is cut after four", async ({ page }) => {
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
