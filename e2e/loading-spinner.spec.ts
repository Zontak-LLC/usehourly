import type { Page } from "@playwright/test";

import { SPINNER_DELAY_MS } from "../src/lib/loading";
import { expect, hold, startFreshAccount, test } from "./helpers";

/**
 * One calm spinner for slow waits (issue 430). Log time saves optimistically: the row shows and the form clears at once,
 * so the button says the save is still open only through `aria-busy` and, after 300 ms, a spinner in its round disc.
 * A fast save shows no spinner at all.
 */
const logButton = (page: Page) => page.getByRole("button", { name: /Log time/ });
const spinner = (page: Page) => logButton(page).getByRole("status", { name: "Saving" });

async function logEntry(page: Page, time: string, note: string) {
  await page.getByLabel("Time to add").fill(time);
  await page.getByLabel("Description").fill(note);
  await logButton(page).click();
}

test("a slow save shows the spinner on Log time, and it goes when the server answers", async ({ page }) => {
  await startFreshAccount(page);
  await hold(page, "entry.create", 2000);
  await logEntry(page, "2h", "Slow save");

  await expect(page.getByLabel("Time to add")).toHaveValue(""); // the form is already clear
  await expect(logButton(page)).toHaveAttribute("aria-busy", "true");
  await expect(spinner(page)).toBeVisible();

  await expect(spinner(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(logButton(page)).not.toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("listitem").filter({ hasText: "Slow save" })).toBeVisible();
});

test("the spinner fits the disc: the same box as the icon, and Log time keeps its width", async ({ page }) => {
  await startFreshAccount(page);
  const disc = logButton(page).locator("> span").first();
  const iconBox = await disc.boundingBox();

  await hold(page, "entry.create", 4000);
  await logEntry(page, "1h", "Same size");
  await expect(spinner(page)).toBeVisible();
  // Past the 1.4 s "Logged 1:00" moment the words are "Log time" again, as before the press.
  await expect(logButton(page).getByText(/^Logged /)).toHaveCount(0);
  await expect(spinner(page)).toBeVisible();
  const busyDisc = await disc.boundingBox();
  const busyWidth = (await logButton(page).boundingBox())?.width;

  await expect(spinner(page)).toHaveCount(0, { timeout: 10_000 });
  const doneWidth = (await logButton(page).boundingBox())?.width;
  expect(iconBox && busyDisc && busyWidth && doneWidth, "all measured").toBeTruthy();
  if (!iconBox || !busyDisc || !busyWidth || !doneWidth) return;
  expect(Math.abs(busyDisc.width - iconBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(busyDisc.height - iconBox.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(busyWidth - doneWidth)).toBeLessThanOrEqual(1);
});

// No wall time (R-152): a slow CI runner once made a real save take longer than the delay and turned a release red. The
// page's clock stands still and the save is held at a gate, so "fast" means "answered before SPINNER_DELAY_MS of the
// page's own clock", whatever the runner's speed.
test("a fast save never shows the spinner, not even for a moment", async ({ page }) => {
  // Watches the whole page from the first load, so a "Saving" spinner shown for a single frame is still seen.
  await page.addInitScript(() => {
    const seen = { spinner: false };
    (window as unknown as { spinnerSeen: typeof seen }).spinnerSeen = seen;
    new MutationObserver(() => {
      if (document.querySelector('[data-slot="spinner"][aria-label="Saving"]')) seen.spinner = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await page.clock.install(); // the clock runs as normal until it is paused below
  await startFreshAccount(page);
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);

  const save = await hold(page, "entry.create");
  try {
    await logEntry(page, "45m", "Fast save");
    await page.clock.runFor(SPINNER_DELAY_MS - 1); // also runs the timers that send the call
    await save.arrived;
    await expect(logButton(page)).toHaveAttribute("aria-busy", "true"); // the save is still open...
    await expect(spinner(page)).toHaveCount(0); // ...and 1 ms before the delay there is no spinner
  } finally {
    save.release();
  }

  // The answer is handled on timers of 0 ms: run only those, so the page's clock stays 1 ms short of the delay.
  await expect
    .poll(async () => {
      await page.clock.runFor(0);
      return logButton(page).getAttribute("aria-busy");
    })
    .not.toBe("true");
  await expect(page.getByRole("listitem").filter({ hasText: "Fast save" })).not.toHaveAttribute("aria-busy", "true");

  await page.clock.runFor(SPINNER_DELAY_MS); // well past the delay: a late spinner would show now
  await expect(spinner(page)).toHaveCount(0);
  const seen = await page.evaluate(() => (window as unknown as { spinnerSeen: { spinner: boolean } }).spinnerSeen);
  expect(seen.spinner, "a Saving spinner was on screen during the test").toBe(false);
});

test("with reduced motion the spinner stands still; with motion its dashes run", async ({ page }) => {
  await startFreshAccount(page);
  await hold(page, "entry.create", 4000);
  await logEntry(page, "1h", "Motion");
  await expect(spinner(page)).toBeVisible();
  const dash = spinner(page).locator("[data-spinner-dash]").first();
  const animation = () => dash.evaluate((el) => getComputedStyle(el).animationName);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await animation()).not.toBe("none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(animation).toBe("none");
  await expect(spinner(page).locator("[data-spinner-dash]")).toHaveCount(12);
});

// The second main button. Not the entry edit's Save: it closes the form at once (optimistic, entry-row.tsx), so its
// button is gone while the save is open. Help's Send stays on screen until the server answers.
test("a slow send on Help shows the spinner on Send, and it goes when the server answers", async ({ page }) => {
  await startFreshAccount(page);
  await page.goto("/help");
  const aside = page.getByRole("complementary", { name: "Still stuck?" });
  await aside.getByRole("button", { name: "Ask a question" }).click();
  await aside.getByRole("textbox").fill("The spinner test asks a question");

  await hold(page, "help.ask", 2000);
  const send = aside.getByRole("button", { name: /^Send/ });
  await send.click();
  await expect(send).toBeDisabled();
  await expect(send).toHaveAttribute("aria-busy", "true");
  await expect(send.getByRole("status", { name: "Sending" })).toBeVisible();
  await expect(send).toContainText("Sending…");

  await expect(aside.getByText("Thanks, we got it. We'll answer by email.")).toBeVisible({ timeout: 10_000 });
  await expect(aside.getByRole("status", { name: "Sending" })).toHaveCount(0);
});
