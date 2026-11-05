import { formatDecimalHours } from "../src/lib/duration";
import { addProjects, expect, pastTimerLock, startFreshAccount, test } from "./helpers";

/**
 * Typed hours are never lost (issue 431, ticket 1 of 4). A first-day tester typed 2 hours and "Homepage design", then
 * pressed Start timer: the timer took the description, the typed 2:00 was never saved, and the invoice showed 0.08 h.
 * Now a typed time makes the main button "Log 2:00" and keeps Start timer off until the time is logged or cleared.
 */
test("a typed 2:00 is logged as 2:00, and the timer never replaces it", async ({ page }) => {
  await startFreshAccount(page, "Acme");
  await addProjects(page, ["Website"]);
  await page.reload();
  const card = page.getByRole("region", { name: /^Log time/ });
  const time = card.getByLabel("Time to add");
  const log = card.getByRole("button", { name: "Log time", exact: true });
  const timer = card.getByRole("region", { name: "Timer" });
  const start = timer.getByRole("button", { name: "Start timer" });
  const reason = timer.getByText("You typed 2:00. Log it first, or clear the time to start a timer.");
  await card.getByRole("radio", { name: /Website/ }).click();
  await expect(card.getByRole("radio", { name: /Website/ })).toHaveAttribute("aria-checked", "true");

  await test.step("the main button says the typed time, and its name stays Log time", async () => {
    await expect(log).toBeDisabled(); // nothing typed yet: the grey "Log time"
    await expect(start).toBeEnabled();
    await time.fill("2");
    await expect(card.getByText("Log 2:00", { exact: true })).toBeVisible();
    await expect(log).toBeEnabled();
    await card.getByRole("button", { name: "30 min", exact: true }).click();
    await expect(card.getByText("Log 2:30", { exact: true })).toBeVisible();
  });

  await test.step("clearing the time turns Start timer on again and logs nothing", async () => {
    await expect(start).toBeDisabled();
    await time.fill("");
    await expect(start).toBeEnabled();
    await expect(timer.getByText(/You typed/)).toHaveCount(0);
    await expect(log).toBeDisabled();
    await expect(page.getByRole("region", { name: "Today's entries" }).getByRole("listitem")).toHaveCount(0);
  });

  await test.step("with 2h and a description typed, Start timer is off and says why", async () => {
    await time.fill("2h");
    await card.getByLabel("Description").fill("Homepage design");
    await expect(start).toBeDisabled();
    await expect(reason).toBeVisible();
    await expect(start).toHaveAttribute("title", "You typed 2:00. Log it first, or clear the time to start a timer.");
    await start.click({ force: true }); // the tester's press: nothing starts
    await expect(card.getByRole("button", { name: "Stop timer" })).toHaveCount(0);
  });

  const entries = page.getByRole("region", { name: "Today's entries" });
  const typedRow = entries.getByRole("listitem").filter({ hasText: "Homepage design" });
  await test.step("Log 2:00 saves exactly that, empties the box and turns the timer on", async () => {
    await log.click();
    await expect(typedRow).toHaveCount(1);
    await expect(typedRow).toContainText("2:00");
    await expect(entries.getByRole("heading", { level: 2 })).toContainText("(1 entry)");
    await expect(time).toHaveValue("");
    await expect(reason).toHaveCount(0);
    await expect(start).toBeEnabled();
  });

  let timerMinutes = 0;
  await test.step("a timer started next adds its own row and leaves the 2:00 row as it was", async () => {
    await start.click();
    await expect(timer.getByRole("button", { name: "Stop timer" })).toBeVisible();
    await pastTimerLock(page);
    await timer.getByRole("button", { name: "Stop timer" }).click();
    const saved = timer.getByRole("group", { name: /Saved time/ });
    await expect(saved).toContainText(/Saved \d+:\d{2}/);
    const [, h, m] = /Saved (\d+):(\d{2})/.exec((await saved.textContent()) ?? "") ?? [];
    timerMinutes = Number(h) * 60 + Number(m);
    expect(timerMinutes).toBeGreaterThanOrEqual(1);
    await pastTimerLock(page);
    await timer.getByRole("button", { name: /^Done$/ }).click();
    await expect(entries.getByRole("heading", { level: 2 })).toContainText("(2 entries)");
    await expect(typedRow).toHaveCount(1);
    await expect(typedRow).toContainText("2:00");
  });

  await test.step("the invoice bills the 2:00 plus the timer, never only the timer", async () => {
    await page.goto("/dashboard/invoices/new");
    const line = page.getByRole("row").filter({ hasText: "Website" });
    await expect(line).toContainText(`${formatDecimalHours(120 + timerMinutes)} h`);
  });
});
