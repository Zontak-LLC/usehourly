import { expect, test } from "./helpers";

/** On a phone the project chips on Today keep their full names: they wrap onto a second row instead of cutting words off. */
test("on a phone, no project name on Today is cut off", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the chips only squeeze on a phone");
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo|try it with sample data/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/dashboard/today");

  const chips = page.getByRole("radio");
  await expect(chips.first()).toBeVisible();
  expect(await chips.count()).toBeGreaterThanOrEqual(3);
  const cut = await chips.evaluateAll((els) =>
    els
      .flatMap((el) => Array.from(el.querySelectorAll("span.font-medium")))
      .filter((name) => name.scrollWidth > name.clientWidth + 1)
      .map((name) => name.textContent),
  );
  expect(cut, "names that are truncated").toEqual([]);
});
