import { expect, startDemo, startFreshAccount, test } from "./helpers";

test("a client with several projects is a closed row that opens, and a long list is cut after four", async ({
  page,
}) => {
  await startDemo(page);
  await page.goto("/dashboard/clients");

  // Northwind Studio has two projects in the sample data: closed to start, one click opens it.
  const northwind = page.getByRole("region", { name: "Northwind Studio" });
  const toggle = northwind.getByRole("button", { name: /Northwind Studio/ }).first();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(northwind.getByText("Website redesign")).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(northwind.getByText("Website redesign")).toBeVisible();

  // On a wide screen a project is ONE line: its name and its action buttons sit at the same height.
  if ((page.viewportSize()?.width ?? 0) >= 640) {
    const line = northwind.getByRole("listitem").filter({ hasText: "Website redesign" }).first();
    const name = await line.getByText("Website redesign").boundingBox();
    const edit = await line.getByRole("button", { name: "Edit Website redesign" }).boundingBox();
    expect(Math.abs((name?.y ?? 0) - (edit?.y ?? 99))).toBeLessThan(30);
  }

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
