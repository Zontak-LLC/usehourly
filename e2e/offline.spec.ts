import { expect, newUser, test } from "./helpers";

/**
 * Entries typed with no connection are kept on the device and sent when it returns, exactly once: also when the
 * request fails while the browser still thinks it is online, and when the server saved the entry but the answer was lost.
 */
async function startFreshAccount(page: import("@playwright/test").Page) {
  const user = newUser();
  await page.goto("/auth/v2/register");
  await page.getByLabel("Name", { exact: true }).fill(user.name);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/dashboard\/today/);
  await page.getByPlaceholder(/company or a person/i).fill("Offline Co");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Time to add")).toBeVisible();
}

const addEntry = async (page: import("@playwright/test").Page, time: string, note: string) => {
  await page.getByLabel("Time to add").fill(time);
  await page.getByLabel("Description").fill(note);
  await page.getByRole("button", { name: /Add to the day/ }).click();
};

test("an entry typed offline is kept on the device and saved once when the connection returns", async ({
  page,
  shot,
  audit,
}) => {
  await startFreshAccount(page);

  await page.context().setOffline(true);
  await expect(page.getByLabel("Offline status")).toContainText("You're offline");
  await expect(page.getByRole("button", { name: /Start timer/ })).toBeDisabled(); // timers need a connection

  await addEntry(page, "1:30", "typed offline");
  const status = page.getByLabel("Offline status");
  await expect(status).toContainText("You're offline · 1 saved on this device");
  await expect(status).toContainText("Offline Co · General");
  await expect(status).toContainText("typed offline");
  await expect(page.getByLabel("Time to add")).toHaveValue(""); // the form was cleared: the entry is safe
  await shot("offline-entry-saved");
  await audit("offline, one entry waiting");

  await page.context().setOffline(false);
  await expect(page.getByText("1 saved entry synced.")).toBeVisible();
  await expect(page.getByLabel("Offline status")).toBeHidden();
  await expect(page.getByText("typed offline")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start timer/ })).toBeEnabled();

  await page.reload();
  await expect(page.getByText("typed offline")).toHaveCount(1); // saved once, not twice
});

test("a request that fails while the browser still says online is kept too, and a lost answer never makes a copy", async ({
  page,
}) => {
  await startFreshAccount(page);

  // 1. the request never reaches the server
  await page.route("**/api/trpc/entry.create*", (route) => route.abort("connectionfailed"));
  await addEntry(page, "45m", "dropped request");
  const status = page.getByLabel("Offline status");
  await expect(status).toContainText("1 saved entry to sync");
  await expect(status).toContainText("dropped request");

  // 2. the server saves it but the answer is lost on the way back
  await page.unroute("**/api/trpc/entry.create*");
  await page.route("**/api/trpc/entry.create*", async (route) => {
    await route.fetch(); // the server really saves it
    await route.abort("connectionfailed"); // but the browser never hears
  });
  await status.getByRole("button", { name: "Try again" }).click();
  await expect(status).toContainText("1 saved entry to sync"); // still waiting: it does not know it was saved

  // 3. the connection is fine again: the retry carries the same id, so the server hands back what it already has
  await page.unroute("**/api/trpc/entry.create*");
  await status.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("1 saved entry synced.")).toBeVisible();
  await expect(status).toBeHidden();

  await page.reload();
  await expect(page.getByText("dropped request")).toHaveCount(1);
});
