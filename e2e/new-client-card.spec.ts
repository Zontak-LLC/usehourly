import { expect, startFreshAccount, test } from "./helpers";

/**
 * Clients: "New client" is a + in the page header that opens the form as a card at the top of the list; an empty page has
 * the big dashed card instead. The numbers that used to sit in three tiles are one line under the title.
 */
test("a new client is added from the card in place, and the title line counts clients, projects and the month", async ({
  page,
}) => {
  await startFreshAccount(page, "Acme Studio");
  await page.goto("/dashboard/clients");
  await expect(page.getByRole("heading", { name: "Clients", level: 1 })).toBeVisible();

  await test.step("the way in is a + in the page header; no dashed card waits at the foot of the list", async () => {
    await expect(page.getByRole("button", { name: "New client" })).toHaveCount(1);
    const header = page.getByRole("heading", { name: "Clients", level: 1 }).locator("xpath=ancestor::header[1]");
    await expect(header.getByRole("button", { name: "New client" })).toHaveCount(1);
  });

  await test.step("the title line counts the clients and projects", async () => {
    await expect(page.getByText(/1 client · 1 project/).first()).toBeVisible();
  });

  await test.step("the + opens the form at the top of the list, and the new client appears", async () => {
    const plus = page.getByRole("button", { name: "New client" });
    await plus.click();
    await expect(plus).toHaveAttribute("aria-expanded", "true");
    const form = page.getByRole("region", { name: "New client" });
    await expect(form).toBeVisible();
    const first = page.getByRole("region", { name: "Acme Studio" });
    expect((await form.boundingBox())?.y ?? 0).toBeLessThan((await first.boundingBox())?.y ?? 0); // above the clients
    await page.getByLabel("New client name").fill("Fernhill");
    await page.getByRole("button", { name: "Add client" }).click();
    await expect(page.getByRole("region", { name: "Fernhill" })).toBeVisible();
    await expect(page.getByText(/2 clients · 1 project/).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "New client" })).toHaveCount(0); // the form closed itself
  });

  await test.step("Cancel closes the form without adding anything", async () => {
    await page.getByRole("button", { name: "New client" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("region", { name: "New client" })).toHaveCount(0);
    await expect(page.getByText(/2 clients/).first()).toBeVisible();
  });
});

test("archived clients and projects open from a menu in the header, on a page of their own, and can be restored", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /try the demo/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/dashboard/clients");

  // nothing about the archive hangs at the foot of the page
  await expect(page.getByRole("button", { name: /Archived clients and projects/ })).toHaveCount(0);

  // archive a project (immediate, with Undo), then find it on the archived page
  await page.getByRole("button", { name: "More actions for Mobile app" }).click();
  await page.getByRole("menuitem", { name: "Archive project" }).click();
  await expect(page.getByText(/Mobile app archived/)).toBeVisible();

  await page.getByRole("button", { name: "More actions for Clients" }).click();
  await page.getByRole("menuitem", { name: "Archived clients and projects" }).click();
  await expect(page).toHaveURL(/dashboard\/clients\/archived/);
  await expect(page.getByRole("heading", { name: "Archived", level: 1 })).toBeVisible();
  const row = page.locator("li", { hasText: "Mobile app ·" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Project restored.")).toBeVisible();
  await expect(page.getByText("Nothing archived.")).toBeVisible();

  await page.getByRole("link", { name: "Clients" }).first().click();
  await expect(page).toHaveURL(/dashboard\/clients$/);
  await expect(page.getByText("Mobile app", { exact: true }).first()).toBeVisible(); // back where it was
});
