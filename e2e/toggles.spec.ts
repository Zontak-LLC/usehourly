import { entryAction, expect, startFreshAccount, test } from "./helpers";

/**
 * A button that opens a form closes it again on the second click, and says whether it is open (aria-expanded). And the
 * day's list is headed as the day's timesheet.
 */
test("buttons that open a form close it on the second click; the day's list is headed as its timesheet", async ({
  page,
}) => {
  await startFreshAccount(page, "Acme Studio");
  await page.getByLabel("Time to add").fill("1.5");
  await page.getByLabel("Description").fill("toggle me");
  await page.getByRole("button", { name: /Add to the day/ }).click();
  await expect(page.getByText("toggle me")).toBeVisible();

  await test.step("Today's list says it is the day's timesheet, with the entry count and the total", async () => {
    const list = page.getByRole("region", { name: "Today's timesheet" });
    await expect(list.getByRole("heading", { name: /Today's timesheet \(1 entry\)/ })).toBeVisible();
    await expect(list).toContainText("Total 1:30");
  });

  await test.step("an entry's pencil opens its form and closes it on the second click", async () => {
    await entryAction(page, "Edit"); // from the entry's "More actions" menu
    const pencil = page.getByRole("button", { name: "Edit", exact: true }); // while the form is open, the card shows one button that closes it
    await expect(pencil).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
    await pencil.click();
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "More actions" })).toBeVisible(); // the menu is back
  });

  await test.step("on Week the day's Edit day button opens every entry's form and Done editing closes them", async () => {
    await page.goto("/dashboard/week");
    const list = page.getByRole("region", { name: "What you worked on" });
    const open = list.getByRole("button", { name: /^Edit .*\d/ });
    await expect(open).toHaveAttribute("aria-expanded", "false");
    await open.click();
    await expect(list.getByRole("button", { name: "Save" })).toBeVisible();
    const close = list.getByRole("button", { name: /^Stop editing/ });
    await expect(close).toContainText("Done editing");
    await expect(close).toHaveAttribute("aria-expanded", "true");
    await close.click();
    await expect(list.getByRole("button", { name: "Save" })).toHaveCount(0);
    await expect(list.getByRole("button", { name: /^Edit .*\d/ })).toContainText("Edit day");
  });

  await test.step("on Clients the + and the billing pencil open their forms and close them again", async () => {
    await page.goto("/dashboard/clients");
    const add = page.getByRole("button", { name: "Add a project for Acme Studio" }).first();
    await expect(add).toHaveAttribute("aria-expanded", "false");
    await add.click();
    await expect(add).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Cancel" }).first()).toBeVisible();
    await add.click();
    await expect(add).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "Add a project for Acme Studio" })).toHaveCount(2); // the header + and the dashed card are back
    await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);

    const billing = page.getByRole("button", { name: "Edit Acme Studio billing details" });
    await expect(billing).toHaveAttribute("aria-expanded", "false");
    await billing.click();
    await expect(billing).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Round the time on invoices")).toBeVisible();
    await billing.click();
    await expect(page.getByText("Round the time on invoices")).toHaveCount(0);
  });
});

test("the Month page's This month button is disabled while already on this month, and works from another month", async ({
  page,
}) => {
  await startFreshAccount(page);
  await page.goto("/dashboard/month");
  const thisMonth = page.getByRole("button", { name: "This month" });
  await expect(thisMonth).toBeDisabled();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(thisMonth).toBeEnabled();
  await thisMonth.click();
  await expect(thisMonth).toBeDisabled();
});
