import { expect, menuAction, startFreshAccount, test } from "./helpers";

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
    const edit = page.getByRole("button", { name: "Edit", exact: true });
    await expect(edit).toHaveAttribute("aria-expanded", "false");
    await edit.click();
    await expect(edit).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
    await edit.click();
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
    await expect(edit).toHaveAttribute("aria-expanded", "false");
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
    await expect(page.getByRole("button", { name: "Add a project for Acme Studio" })).toHaveCount(1); // only the + in the header: a client that has a project no longer shows a dashed add card
    await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);

    await menuAction(page, "More actions for Acme Studio", "Billing details"); // the ··· menu opens the form
    await expect(page.getByText("Round the time on invoices")).toBeVisible();
    await menuAction(page, "More actions for Acme Studio", "Close billing details"); // and the same item closes it
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
