import { addProjects, expect, startFreshAccount, test } from "./helpers";

/**
 * On Week, pressing a project in "By project" filters the page. Every project stays in that list while one is picked
 * (it used to shrink to the picked row, leaving only the drop-down at the top as a way back), and "Show all" clears it.
 */
test("a picked project keeps the whole By project list, and Show all goes back", async ({ page }) => {
  await startFreshAccount(page);
  await addProjects(page, ["Design"]);
  await page.reload();

  // One entry on each project, today.
  for (const [project, time] of [
    ["General", "1:00"],
    ["Design", "2:00"],
  ] as const) {
    await page.getByRole("radio", { name: new RegExp(project) }).click();
    await page.getByLabel("Time to add").fill(time);
    await page.getByRole("button", { name: "Log time" }).click();
    await expect(
      page
        .getByRole("region", { name: /entries/i })
        .getByText(time)
        .first(),
    ).toBeVisible();
  }

  await page.goto("/dashboard/week");
  const card = page.getByRole("region", { name: "This week", exact: true });
  await expect(card.getByRole("button", { name: /Design/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /General/ })).toBeVisible();
  await expect(card.getByRole("button", { name: "Show all" })).toHaveCount(0);

  await card.getByRole("button", { name: /Design/ }).click();
  await expect(page).toHaveURL(/project=/);
  await expect(card.getByRole("button", { name: /Design/ })).toHaveAttribute("aria-pressed", "true");
  // The other project is still there to press: the list did not shrink to one row.
  await expect(card.getByRole("button", { name: /General/ })).toHaveAttribute("aria-pressed", "false");

  await card.getByRole("button", { name: "Show all" }).click();
  await expect(page).not.toHaveURL(/project=/);
  for (const name of [/Design/, /General/]) {
    await expect(card.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
  }
  await expect(card.getByRole("button", { name: "Show all" })).toHaveCount(0);
});
