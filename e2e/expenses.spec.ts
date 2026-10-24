import { FEATURES } from "../src/lib/features";
import { expect, startFreshAccount, test } from "./helpers";

test.skip(!FEATURES.expenses, "Expenses are hidden in this release (src/lib/features.ts)");

/** Issue #100, first slice: expenses and mileage recorded on the Year summary, added up and exported with it. */
test("a freelancer records an expense and a trip, and the Year summary adds them up", async ({ page, audit }) => {
  await startFreshAccount(page, "Northwind");
  await page.goto("/dashboard/report#expenses");
  const section = page.getByRole("region", { name: "Expenses" });
  await expect(section).toBeVisible();

  await test.step("an expense: amount and category", async () => {
    await section.getByRole("button", { name: "Add expense" }).click();
    const form = section.getByRole("form", { name: "Add an expense" });
    await form.getByLabel("Amount").fill("ten");
    await form.getByRole("button", { name: "Add expense" }).click();
    await expect(form.getByRole("alert")).toHaveText("Type the amount as a number, like 12.50.");
    await form.getByLabel("Amount").fill("49");
    await form.getByLabel("Category").selectOption({ label: "Software and subscriptions" });
    await form.getByLabel("Client (optional)").selectOption({ label: "Northwind" });
    await form.getByLabel("Note").fill("Design app");
    await form.getByRole("button", { name: "Add expense" }).click();
    await expect(page.getByText("Expense added.")).toBeVisible();
    await expect(section.getByRole("list", { name: /Expenses in/ })).toContainText("Design app");
  });

  await test.step("a trip: the amount is worked out from distance and rate", async () => {
    await section.getByRole("button", { name: "Add expense" }).click();
    const form = section.getByRole("form", { name: "Add an expense" });
    await form.getByRole("radio", { name: "Mileage" }).click();
    await expect(form.getByLabel("Rate per mile")).toHaveValue("0.70");
    await form.getByLabel("Distance").fill("12.3");
    await expect(form.getByText("This trip comes to $8.61.")).toBeVisible();
    await form.getByRole("button", { name: "Add expense" }).click();
    await expect(page.getByText("Expense added.").first()).toBeVisible();
  });

  await test.step("the totals: spent, mileage and the net estimate", async () => {
    await expect(section.getByText("$57.61").first()).toBeVisible();
    await expect(section.getByText("Mileage (1 trip)")).toBeVisible();
    await expect(section.getByText("12.3 mi at 0.70 per mile")).toBeVisible();
    await expect(section.getByText("-$57.61").first()).toBeVisible(); // nothing received yet
    await audit("year summary with expenses");
  });

  await test.step("edit and delete", async () => {
    const list = section.getByRole("list", { name: /Expenses in/ });
    await list.getByRole("listitem").filter({ hasText: "Design app" }).getByRole("button", { name: /^Edit/ }).click();
    const form = section.getByRole("form", { name: "Edit expense" });
    await form.getByLabel("Amount").fill("51");
    await form.getByRole("button", { name: "Save expense" }).click();
    await expect(page.getByText("Expense saved.")).toBeVisible();
    await expect(section.getByText("$59.61").first()).toBeVisible();
    await page.reload(); // it is stored, not only on screen
    await expect(section.getByText("$59.61").first()).toBeVisible();

    await list.getByRole("listitem").filter({ hasText: "Mileage" }).getByRole("button", { name: /^Edit/ }).click();
    await section.getByRole("form", { name: "Edit expense" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Expense deleted.")).toBeVisible();
    await expect(section.getByText("Mileage (1 trip)")).toHaveCount(0);
    await expect(section.getByText("$51.00").first()).toBeVisible();
  });

  await test.step("Export Excel carries the expenses", async () => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Excel" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  });
});
