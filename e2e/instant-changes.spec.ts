import type { Page } from "@playwright/test";

import { entryAction, expect, openEntryMenu, startFreshAccount, test } from "./helpers";

/**
 * Adding, editing and deleting an entry show on screen at once; the server's answer only confirms them. Each test
 * holds the server's answer back for four seconds (or has it refuse) and checks the screen within a second and a half.
 */
const SLOW = 4000;

async function hold(page: Page, procedure: string) {
  await page.route(`**/api/trpc/${procedure}*`, async (route) => {
    await new Promise((r) => setTimeout(r, SLOW));
    await route.continue();
  });
}

async function addEntry(page: Page, time: string, note: string) {
  await page.getByPlaceholder(/Time:/).fill(time);
  await page.getByLabel("Description").fill(note);
  await page.getByRole("button", { name: /Add to the day/ }).click();
}

test("a new entry is in the list and the form is clear before the server has answered", async ({ page }) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/today");
  await hold(page, "entry.create");
  const typedAt = Date.now();
  await addEntry(page, "90m", "Added instantly");
  await expect(page.getByText("Added instantly")).toBeVisible({ timeout: 1500 });
  await expect(page.getByPlaceholder(/Time:/)).toHaveValue(""); // ready for the next one
  expect(Date.now() - typedAt).toBeLessThan(SLOW - 1000); // the server had not answered yet
  // an unconfirmed entry cannot be edited or deleted yet
  await page.getByRole("button", { name: "More actions" }).first().click();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  await page.keyboard.press("Escape");
  // once the server confirms, it is a normal entry again
  await expect(page.getByRole("listitem").filter({ hasText: "Added instantly" })).not.toHaveAttribute(
    "aria-busy",
    "true",
    {
      timeout: SLOW + 6000,
    },
  );
  await openEntryMenu(page);
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Added instantly")).toHaveCount(1);
});

test("when the server refuses a new entry, it disappears and what was typed comes back", async ({ page }) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/today");
  // A refusal the app handles (a 200 carrying an error answer, so the browser does not log a failed request).
  await page.route("**/api/trpc/entry.create*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { error: { message: "Refused on purpose.", code: -32600, data: { code: "BAD_REQUEST", httpStatus: 400 } } },
      ]),
    }),
  );
  await addEntry(page, "2h", "Will be refused");
  await expect(page.getByText("Refused on purpose.")).toBeVisible();
  await expect(page.getByText("Will be refused", { exact: true }).first()).toBeVisible(); // given back in the form
  await expect(page.getByPlaceholder(/Time:/)).toHaveValue("2h");
  await expect(page.getByRole("button", { name: "More actions" })).toHaveCount(0); // the optimistic row is gone
});

test("deleting an entry removes it at once, and an edit shows its new time at once", async ({ page }) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/today");
  await addEntry(page, "1h", "Edit then delete me");
  await openEntryMenu(page);
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeEnabled();
  await page.keyboard.press("Escape");

  await hold(page, "entry.update");
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.getByLabel("Time", { exact: true }).fill("3h");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "3:00" })).toBeVisible({ timeout: 1500 }); // new time, form closed
  await page.unroute("**/api/trpc/entry.update*");
  await expect(page.getByRole("button", { name: "3:00" })).toBeVisible({ timeout: SLOW + 6000 }); // and it stays

  await hold(page, "entry.delete");
  await entryAction(page, "Delete");
  await page.getByRole("region", { name: "Delete this entry?" }).getByRole("button", { name: "Delete entry" }).click();
  await expect(page.getByText("Edit then delete me")).toHaveCount(0, { timeout: 1500 });
});
