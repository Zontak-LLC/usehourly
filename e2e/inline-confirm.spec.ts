import { expect, test } from "@playwright/test";

import { startDemo } from "./helpers";

/** Deleting an invoice asks inside its card; archiving a client or project is immediate with Undo (no pop-ups). */
test("delete invoice confirms inside the card; archive is immediate with Undo", async ({ page }) => {
  await startDemo(page);

  await test.step("an invoice's delete question opens in its card and names the invoice", async () => {
    await page.goto("/dashboard/invoices");
    const card = page.getByRole("region", { name: "Your invoices" }).getByRole("listitem").first();
    const number = (
      await card
        .getByText(/^INV-\d{4}-\d{3}$/)
        .first()
        .innerText()
    ).trim();
    await card
      .getByRole("button", { name: `More actions for ${number}` })
      .locator("visible=true")
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Delete invoice" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const ask = card.getByRole("region", { name: `Delete invoice ${number}?` });
    await expect(ask).toContainText("This can't be undone");
    await ask.getByRole("button", { name: "Cancel" }).click(); // cancelling keeps it
    await expect(ask).toBeHidden();
    await expect(card.getByText(number).first()).toBeVisible();
  });

  await test.step("archiving a project happens at once and offers Undo", async () => {
    await page.goto("/dashboard/clients");
    await page.getByRole("button", { name: "Edit Mobile app" }).click();
    await page.getByRole("button", { name: "Archive project" }).click(); // the red button in the project's edit form
    await expect(page.getByRole("dialog")).toHaveCount(0); // no "Are you sure?"
    await expect(page.getByText(/Mobile app archived/)).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Mobile app", { exact: true }).first()).toBeVisible();
  });
});
