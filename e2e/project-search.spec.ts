import { addProjects, expect, test } from "./helpers";

/** The project picker on Today: from six projects, "More…" opens a search (a drop-down on a computer, a dialog on a phone). */
async function demoToday(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  await addProjects(page, ["Extra one", "Extra two"]); // the sample has four; "More…" starts at six
  await page.goto("/dashboard/today");
  await expect(page.getByLabel("Time to add")).toBeVisible();
}

test("type, use the arrow keys and press Enter to pick a project; the time box is next", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "on a phone the search opens in a dialog (next test)");
  await demoToday(page);
  const more = page.getByRole("button", { name: "Search projects or clients" });
  await expect(more).toBeVisible();
  const field = page.getByRole("combobox", { name: "Search projects or clients" });

  // "/" from the page opens the search with the cursor in it
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("/");
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("placeholder", /Search 6 projects or clients/);
  // Scoped to the list: an entry's "Move to another project" select on the page has <option>s of its own.
  const options = page.getByRole("listbox", { name: "Projects" }).getByRole("option");
  await expect(options.first()).toBeVisible(); // the list drops down at once

  await field.fill("mob");
  await expect(options.first()).toContainText("Mobile");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("radio", { name: /Mobile/ }).first()).toBeChecked();
  await expect(page.getByLabel("Time to add")).toBeFocused(); // on to the time
  await expect(field).toHaveCount(0); // the search closed

  // Escape closes the list without picking
  await more.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(more).toBeFocused(); // the focus goes back to "More…"

  // "More…" opens and closes the search
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("the project pills are one radio group: the arrow keys move and pick", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "keyboard");
  await demoToday(page);
  const checked = page.getByRole("radiogroup").getByRole("radio", { checked: true });
  const first = await checked.textContent();
  await checked.focus();
  await page.keyboard.press("ArrowRight");
  await expect(checked).not.toHaveText(first ?? "");
  await expect(checked).toBeFocused();
  await expect(page.getByRole("radiogroup").getByRole("radio", { checked: false }).first()).toHaveAttribute(
    "tabindex",
    "-1",
  );
});

test("a star pins a project as a pill, and the pin is still there after a reload", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "on a phone the search opens in a dialog (next test)");
  await demoToday(page);
  await page.getByRole("button", { name: "Search projects or clients" }).click();
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
