import { FEATURES } from "../src/lib/features";
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

  await test.step("their initials show until they add a picture; the name is only in the menu (issue 217)", async () => {
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText(user.name.slice(0, 1).toUpperCase());
    await expect(trigger).not.toContainText(user.name); // a long name used to push the top bar onto two rows
    await expect(trigger.locator("img")).toHaveCount(0);
  });

  await test.step("the side menu no longer carries the name or Log out", async () => {
    if (phone || !FEATURES.appearanceExtras) return; // the side menu is a choice that is hidden in this release
    await page.context().addCookies([{ name: "nav_position", value: "left", url: new URL("/", page.url()).href }]); // journeys start on the tab strip; the side menu is a choice
    await page.reload();
    const side = page.getByRole("navigation", { name: "Side menu" });
    await expect(side).toBeVisible();
    await expect(side.getByRole("button", { name: "Log out" })).toHaveCount(0);
    await expect(side.getByText(user.email)).toHaveCount(0);
  });

  await test.step("a picture can be added straight from the menu, and removed from it", async () => {
    if (!FEATURES.avatar) {
      // Pictures are hidden in this release (src/lib/features.ts): the menu offers none.
      await trigger.click();
      await expect(page.getByRole("menuitem", { name: "Add a picture" })).toHaveCount(0);
      await page.keyboard.press("Escape");
      return;
    }
    await trigger.click();
    await expect(page.getByRole("menuitem", { name: "Add a picture" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByLabel("Choose your picture file")
      .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PIXEL });
    await page.getByRole("button", { name: "Save picture" }).click(); // the position editor opens first
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
    if (!FEATURES.avatar) return; // pictures are hidden in this release (src/lib/features.ts)
    await page
      .getByLabel("Choose picture file")
      .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PIXEL });
    await page.getByRole("button", { name: "Save picture" }).click();
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
