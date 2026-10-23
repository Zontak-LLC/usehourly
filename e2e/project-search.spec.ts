import { expect, test } from "./helpers";

/** The project picker on Today: with many projects a search field takes the place of "More…". */
async function demoToday(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
}

test("type, use the arrow keys and press Enter to pick a project; the time box is next", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "on a phone the search opens in a dialog (next test)");
  await demoToday(page);
  const field = page.getByRole("combobox", { name: "Search projects or clients" });
  await expect(field).toHaveAttribute("placeholder", /Search \d+ projects or clients/);

  // "/" from the page jumps to the field
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("/");
  await expect(field).toBeFocused();
  // Scoped to the list: an entry's "Move to another project" select on the page has <option>s of its own.
  const options = page.getByRole("listbox", { name: "Projects" }).getByRole("option");
  await expect(options.first()).toBeVisible(); // the list drops down at once

  await field.fill("mob");
  await expect(options.first()).toContainText("Mobile");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("radio", { name: /Mobile/ }).first()).toBeChecked();
  await expect(page.getByLabel("Time to add")).toBeFocused(); // on to the time
  await expect(field).toHaveValue("");

  // Escape closes the list without picking
  await field.focus();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("a star pins a project as a pill, and the pin is still there after a reload", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "on a phone the search opens in a dialog (next test)");
  await demoToday(page);
  const field = page.getByRole("combobox", { name: "Search projects or clients" });
  await field.fill("support");
  const pin = page.getByRole("button", { name: /^Pin / }).first();
  const label = (await pin.getAttribute("aria-label")) ?? "";
  const name = label.replace(/^Pin /, "");
  await pin.click();
  await expect(page.getByRole("button", { name: `Unpin ${name}` }).first()).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("radio", { name: new RegExp(name) }).first()).toBeVisible(); // a pill, or the picked row
});

test("on a phone the search opens at the top of the screen, and a tap picks the project", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "only phones open the search in a dialog");
  await demoToday(page);
  await page.getByRole("button", { name: "Search projects or clients" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").fill("mob");
  await dialog.getByRole("option").first().click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Mobile/ }).first()).toBeChecked();
});
