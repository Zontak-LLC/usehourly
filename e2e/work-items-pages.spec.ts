import { expect, test } from "@playwright/test";

import { addEntries, openAllEntries, startDemo } from "./helpers";
import { today } from "./today";

/** "All entries this month" shows 3 entries per page on a phone and 10 on a wide screen (issue: 7 was too many for a phone). */
test("the work list is paginated 3 per page on a phone and 10 on a wide screen", async ({ page }, info) => {
  await startDemo(page);
  // The 1st of this (local) month: never in the future and always in the month shown, so the list has more than one
  // page on any date (the sample month alone can be short, e.g. 9 entries on 16 November 2026).
  await addEntries(page, `${today().slice(0, 8)}01`, 11);
  await page.goto("/dashboard/month");
  await openAllEntries(page); // folded behind "All entries this month"

  const list = page.getByRole("region", { name: /^All entries this (week|month)$/ });
  const size = info.project.name === "phone" ? 3 : 10;
  const range = list.getByText(/^Showing 1–\d+ of \d+$/);
  await expect(range).toBeVisible();
  const [, shown, total] = (await range.innerText()).match(/Showing 1–(\d+) of (\d+)/) ?? [];
  expect(Number(total)).toBeGreaterThan(size); // more entries than one page
  expect(Number(shown)).toBe(size);

  await list.getByRole("button", { name: "Next page" }).click();
  await expect(list.getByText(new RegExp(`^Showing ${size + 1}–`))).toBeVisible();
});
