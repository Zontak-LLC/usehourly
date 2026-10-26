import { expect, test } from "@playwright/test";

import { startDemo } from "./helpers";

// On a phone the sample's four project pills pushed Log time under the bottom menu at load (2026-10-25). The button now
// sits right under the quick times: in view at load, and covering nothing (a floating button hid the project pills).
test("on a phone Today's Log time button is in view at load, under the quick times, and hides no project", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone", "a phone check");
  await startDemo(page);
  await page.goto("/dashboard/today");
  const log = page.getByRole("button", { name: /^Log time/ });
  const menu = page.getByRole("navigation").filter({ has: page.getByRole("link", { name: "Week" }) });
  await expect(log).toBeVisible();

  // nothing scrolled: the button ends above the menu, and a tap on its middle lands on it (not on the menu)
  const button = await log.boundingBox();
  const bar = await menu.last().boundingBox();
  expect(button && bar, "both are on screen").toBeTruthy();
  if (!button || !bar) return;
  expect(button.y + button.height).toBeLessThanOrEqual(bar.y);
  const onTop = await log.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && el.contains(hit);
  });
  expect(onTop).toBe(true);

  // under the quick times, above the projects
  const chip = await page.getByRole("button", { name: "1 hour", exact: true }).boundingBox();
  const firstPill = page.getByRole("radio").first();
  const pill = await firstPill.boundingBox();
  expect(chip && pill && chip.y < button.y && button.y < pill.y).toBe(true);

  // every project pill is reachable: scrolled into view, a tap on its middle lands on the pill itself
  for (const radio of await page.getByRole("radio").all()) {
    const free = await radio.evaluate((el) => {
      el.scrollIntoView({ block: "center" }); // the bottom menu covers the screen's last 90 px on purpose
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && el.contains(hit);
    });
    expect(free, `${await radio.textContent()} is not covered`).toBe(true);
  }

  // it still works: a quick time, then Log time
  await page.getByRole("button", { name: "1 hour", exact: true }).click();
  await log.click();
  await expect(page.getByText("Logged 1:00")).toBeVisible();
});
