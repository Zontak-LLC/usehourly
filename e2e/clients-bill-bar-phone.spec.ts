import { expect, test } from "@playwright/test";

import { startDemo } from "./helpers";

// On a phone the "not invoiced · Make invoice" bar was pinned over a client's forms and covered the field being typed
// in (2026-10-26). While a form is open it now waits at the end of the page instead.
test("on a phone the bill bar never covers a client's Billing form, and Make invoice is still at the end", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone", "a phone check");
  await startDemo(page);
  await page.goto("/dashboard/clients");
  await page.getByRole("link").filter({ hasText: "Fable Labs" }).first().click();
  const bar = page.getByTestId("bill-bar");
  await expect(bar).toBeVisible();

  await page.getByRole("tab", { name: "Billing" }).click();
  const email = page.getByLabel("Email for invoices");
  await expect(email).toBeVisible();

  // each field of the form, brought to the lower part of the screen where the bar used to sit, takes its own tap
  for (const field of [page.getByLabel("Name on invoices"), page.getByLabel("Address on invoices"), email]) {
    const free = await field.evaluate((el) => {
      el.scrollIntoView({ block: "end" });
      window.scrollBy(0, 120); // the bottom menu covers the screen's last 90 px on purpose; the bar sat above it
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && el.contains(hit);
    });
    expect(free, `${await field.getAttribute("name")} is not covered`).toBe(true);
  }

  // Make invoice waits at the end of the page
  await bar.scrollIntoViewIfNeeded();
  await expect(bar.getByText("Make invoice")).toBeVisible();
});
