import { expect, startFreshAccount, test } from "./helpers";

// A 1x1 PNG: the browser turns whatever is chosen into a 128x128 picture, so any real image will do.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** The signed-in person sits at the top right (picture or initials, name, a menu with Account and Log out). */
test("the top right shows who is signed in, with a menu for Account and Log out, and a picture of your own", async ({
  page,
}, info) => {
  const phone = info.project.name === "phone";
  const user = await startFreshAccount(page);
  const trigger = page.getByRole("button", { name: /Account menu for/ });

  await test.step("their initials show until they add a picture, and the name beside them on a wide screen", async () => {
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText(user.name.slice(0, 1).toUpperCase());
    if (!phone) await expect(trigger).toContainText(user.name);
    await expect(trigger.locator("img")).toHaveCount(0);
  });

  await test.step("the side menu no longer carries the name or Log out", async () => {
    if (phone) return;
    await page.context().clearCookies({ name: "nav_position" }); // journeys start on the tab strip; the default is the side menu
    await page.reload();
    const side = page.getByRole("navigation", { name: "Side menu" });
    await expect(side).toBeVisible();
    await expect(side.getByRole("button", { name: "Log out" })).toHaveCount(0);
    await expect(side.getByText(user.email)).toHaveCount(0);
  });

  await test.step("a picture can be added straight from the menu, and removed from it", async () => {
    await trigger.click();
    await expect(page.getByRole("menuitem", { name: "Add a picture" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByLabel("Choose your picture file")
      .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PIXEL });
    await expect(page.getByText("Picture saved.")).toBeVisible();
    await expect(trigger.locator("img")).toBeVisible();
    await trigger.click();
    await expect(page.getByRole("menuitem", { name: "Change your picture" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Remove your picture" }).click();
    await expect(page.getByText("Picture removed.")).toBeVisible();
    await expect(trigger.locator("img")).toHaveCount(0);
  });

  await test.step("the menu names the person and links to Account", async () => {
    await trigger.click();
    await expect(page.getByRole("menu").getByText(user.email)).toBeVisible();
    await page.getByRole("menuitem", { name: "Account", exact: true }).click();
    await expect(page).toHaveURL(/dashboard\/account/);
  });

  await test.step("a picture added on Account replaces the initials in the top bar, and can be removed", async () => {
    await page
      .getByLabel("Choose picture file")
      .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PIXEL });
    await expect(page.getByText("Picture saved.")).toBeVisible();
    await expect(trigger.locator("img")).toBeVisible();
    await page.reload();
    await expect(trigger.locator("img")).toBeVisible(); // kept on the account, not just on this page
    await page.getByRole("button", { name: "Remove picture" }).click();
    await expect(page.getByText("Picture removed.")).toBeVisible();
    await expect(trigger.locator("img")).toHaveCount(0);
    await expect(trigger).toContainText(user.name.slice(0, 1).toUpperCase());
  });

  await test.step("Log out ends the session and lands on the sign-in page", async () => {
    await trigger.click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(/auth\/v2\/login/);
  });
});
