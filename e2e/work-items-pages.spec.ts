import { expect, test } from "@playwright/test";

import { openAllEntries, startDemo } from "./helpers";

/** "All entries this month" shows 3 entries per page on a phone and 10 on a wide screen (issue: 7 was too many for a phone). */
test("the work list is paginated 3 per page on a phone and 10 on a wide screen", async ({ page }, info) => {
  await startDemo(page);
  await page.goto("/dashboard/month");
  await openAllEntries(page); // folded behind "All entries this month"

  const list = page.getByRole("region", { name: /^All entries this (week|month)$/ });
  const size = info.project.name === "phone" ? 3 : 10;
  const range = list.getByText(/^Showing 1–\d+ of \d+$/);
  await expect(range).toBeVisible();
  const [, shown, total] = (await range.innerText()).match(/Showing 1–(\d+) of (\d+)/) ?? [];
  expect(Number(total)).toBeGreaterThan(size); // the sample month has more entries than one page
  expect(Number(shown)).toBe(size);

  await list.getByRole("button", { name: "Next page" }).click();
  await expect(list.getByText(new RegExp(`^Showing ${size + 1}–`))).toBeVisible();
});
