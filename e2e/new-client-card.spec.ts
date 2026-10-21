import { expect, startFreshAccount, test } from "./helpers";

/**
 * Clients: "New client" is a dashed card at the end of the list that turns into the form in place (ticket #135), and the
 * numbers that used to sit in three tiles are one line under the title.
 */
test("a new client is added from the card in place, and the title line counts clients, projects and the month", async ({
  page,
}) => {
  await startFreshAccount(page, "Acme Studio");
  await page.goto("/dashboard/clients");
  await expect(page.getByRole("heading", { name: "Clients", level: 1 })).toBeVisible();

  await test.step("the page has no New client button in its header; the card is the way in", async () => {
    await expect(page.getByRole("button", { name: "New client" })).toHaveCount(1);
    const header = page.getByRole("heading", { name: "Clients", level: 1 }).locator("xpath=ancestor::header[1]");
    await expect(header.getByRole("button", { name: "New client" })).toHaveCount(0);
  });

  await test.step("the title line counts the clients and projects", async () => {
    await expect(page.getByText(/1 client · 1 project/)).toBeVisible();
  });

  await test.step("the card turns into the form where it is, and a new client appears above it", async () => {
    const card = page.getByRole("button", { name: "New client" });
    const before = await card.boundingBox();
    await card.click();
    const form = page.getByRole("region", { name: "New client" });
    await expect(form).toBeVisible();
    const after = await form.boundingBox();
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(8); // same place, no jump to another row
    await page.getByLabel("New client name").fill("Fernhill");
    await page.getByRole("button", { name: "Add client" }).click();
    await expect(page.getByRole("region", { name: "Fernhill" })).toBeVisible();
    await expect(page.getByText(/2 clients · 1 project/)).toBeVisible();
    await expect(page.getByRole("button", { name: "New client" })).toBeVisible(); // the card is back
  });

  await test.step("Cancel puts the card back without adding anything", async () => {
    await page.getByRole("button", { name: "New client" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "New client" })).toBeVisible();
    await expect(page.getByText(/2 clients/)).toBeVisible();
  });
});
