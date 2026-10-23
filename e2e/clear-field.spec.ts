import { expect, openAllEntries, startFreshAccount, test } from "./helpers";

// A clear (×) button on every text field (issue 220): built once into the shared Input and Textarea, turned on per
// field. It empties the box the way typing would (so the page's state and saved values follow) and gives the focus back.
// Passwords never get one.
test("the × empties a typed description, a saved name and a search box, and passwords have none", async ({ page }) => {
  await startFreshAccount(page, "Acme");
  const clear = (scope: { getByRole: typeof page.getByRole }) =>
    scope.getByRole("button", { name: "Clear", exact: true });

  await test.step("a description: the × shows only with text, empties it, and the saved entry has the new text", async () => {
    const description = page.getByLabel("Description");
    const form = page.locator("form").filter({ has: description });
    await expect(clear(form)).toHaveCount(0);
    await description.fill("Draft words I do not want");
    await clear(form).click();
    await expect(description).toHaveValue("");
    await expect(description).toBeFocused();
    await expect(clear(form)).toHaveCount(0);
    await description.fill("Homepage copy");
    await page.getByLabel("Time to add").fill("1:00");
    await page.getByRole("button", { name: /^Log time/ }).click();
    await expect(page.getByText("Homepage copy")).toBeVisible();
    await expect(page.getByText("Draft words I do not want")).toHaveCount(0);
  });

  await test.step("a field filled from the account (not typed): the × is there at once and the new name saves", async () => {
    await page.goto("/dashboard/account");
    const name = page.getByLabel("Name", { exact: true });
    const form = page.locator("form").filter({ has: name });
    await expect(name).not.toHaveValue("");
    await clear(form).click();
    await expect(name).toHaveValue("");
    await expect(name).toBeFocused();
    await name.fill("Sam Cleared");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Profile updated.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Sam Cleared");
  });

  await test.step("passwords never get a ×", async () => {
    const current = page.getByLabel("Current password");
    await current.fill("something secret");
    await expect(clear(page.locator("form").filter({ has: current }))).toHaveCount(0);
  });

  await test.step("the search over this week's entries: the × brings every entry back", async () => {
    await page.goto("/dashboard/week");
    await openAllEntries(page);
    const list = page.getByRole("region", { name: "What you worked on" });
    const search = page.getByLabel("Search what you worked on");
    await search.fill("nothing like this");
    await expect(list.getByText("Homepage copy")).toHaveCount(0);
    await clear(list).click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(list.getByText("Homepage copy").first()).toBeVisible();
  });
});
