import type { Page } from "@playwright/test";

import { expect, startFreshAccount, test } from "./helpers";

// Log first, note later (2026-10-24, the owner): time goes in with no description; the note follows from the Log time
// form's follow-up box, a "+ Add note" in every entries list, or the day card's end-of-day line.

/** The entries of the browser's today, as the server has them. */
async function serverEntries(page: Page) {
  const day = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const input = encodeURIComponent(JSON.stringify({ 0: { from: day, to: day } }));
  const res = await page.request.get(`/api/trpc/entry.list?batch=1&input=${input}`);
  const body = (await res.json()) as { result: { data: { note: string; minutes: number }[] } }[];
  return body[0].result.data.map((e) => ({ minutes: e.minutes, note: e.note })).sort((a, b) => a.minutes - b.minutes);
}

const shot = (page: Page, project: string, name: string) =>
  page.screenshot({ path: `e2e/report/note-later/${project}-${name}.png`, caret: "initial" });

/** Logs a time with Enter and nothing in the description, and waits until the server has it. */
async function logBare(page: Page, time: string, label: string) {
  await page.getByLabel("Time to add").fill(time);
  await page.getByLabel("Time to add").press("Enter");
  await expect(page.getByLabel(`Add a note to the ${label} you just logged (General · Acme)`)).toBeVisible();
}

test("log with Enter and no note: the box then names that entry, and Enter puts the note on it (no second entry)", async ({
  page,
}, info) => {
  await startFreshAccount(page, "Acme");
  await expect(page.getByLabel("Description")).toHaveAttribute(
    "placeholder",
    "What did you work on? (optional, you can add it later)",
  );

  await test.step("the follow-up box belongs to the 1:30 just logged", async () => {
    await logBare(page, "1:30", "1:30");
    await shot(page, info.project.name, "2-follow-up");
    const box = page.getByLabel("Add a note to the 1:30 you just logged (General · Acme)");
    await box.fill("Homepage hero and contact form");
    await box.press("Enter");
    await expect(page.getByRole("region", { name: "Today's entries" })).toContainText("Homepage hero and contact form");
    await expect(page.getByLabel("Description")).toHaveValue(""); // back to normal: the next entry's description
    await expect.poll(() => serverEntries(page)).toEqual([{ minutes: 90, note: "Homepage hero and contact form" }]);
  });

  await test.step("Escape lets the follow-up go: nothing is saved", async () => {
    await logBare(page, "45m", "0:45");
    const box = page.getByLabel("Add a note to the 0:45 you just logged (General · Acme)");
    await box.fill("not this");
    await box.press("Escape");
    await expect(page.getByLabel("Description")).toHaveValue("");
    await expect
      .poll(() => serverEntries(page))
      .toEqual([
        { minutes: 45, note: "" },
        { minutes: 90, note: "Homepage hero and contact form" },
      ]);
  });

  await test.step("a description typed before Log time is saved with the entry, as before: no follow-up box", async () => {
    await page.getByLabel("Description").fill("Plugin updates");
    await page.getByLabel("Time to add").fill("2h");
    await page.getByLabel("Time to add").press("Enter");
    await expect(page.getByRole("region", { name: "Today's entries" })).toContainText("Plugin updates");
    await expect(page.getByLabel(/you just logged/)).toHaveCount(0);
    await expect.poll(async () => (await serverEntries(page)).length).toBe(3);
  });
});

test("+ Add note in the entries lists of Today, Week and Month: Enter saves, Escape cancels", async ({
  page,
}, info) => {
  await startFreshAccount(page, "Acme");
  await logBare(page, "1h", "1:00");
  await logBare(page, "2h", "2:00");
  await logBare(page, "45m", "0:45");
  await page.getByLabel("Add a note to the 0:45 you just logged (General · Acme)").press("Escape");

  await test.step("Today", async () => {
    await page.getByRole("button", { name: "Add a note to General 1:00" }).click();
    const box = page.getByLabel("Note for General 1:00");
    await expect(box).toBeFocused();
    await box.fill("Kick-off call");
    await shot(page, info.project.name, "3-add-note");
    await box.press("Enter");
    await expect(page.getByRole("region", { name: "Today's entries" })).toContainText("Kick-off call");
    await expect(page.getByRole("button", { name: "Add a note to General 1:00" })).toHaveCount(0);

    await page.getByRole("button", { name: "Add a note to General 2:00" }).click();
    await page.getByLabel("Note for General 2:00").fill("never mind");
    await page.getByLabel("Note for General 2:00").press("Escape");
    await expect(page.getByRole("button", { name: "Add a note to General 2:00" })).toBeVisible();
    await expect(page.getByText("never mind")).toHaveCount(0);
  });

  await test.step("Week", async () => {
    await page.goto("/dashboard/week");
    await page.getByRole("button", { name: "Add a note to General 2:00" }).first().click();
    await page.getByLabel("Note for General 2:00").fill("Design review");
    await page.getByLabel("Note for General 2:00").press("Enter");
    await expect(page.getByText("Design review").first()).toBeVisible();
  });

  await test.step("Month", async () => {
    await page.goto("/dashboard/month");
    await page.getByRole("button", { name: "Add a note to General 0:45" }).first().click();
    await page.getByLabel("Note for General 0:45").fill("Invoices sent");
    await page.getByLabel("Note for General 0:45").press("Enter");
    await expect(page.getByText("Invoices sent").first()).toBeVisible();
  });

  await expect
    .poll(() => serverEntries(page))
    .toEqual([
      { minutes: 45, note: "Invoices sent" },
      { minutes: 60, note: "Kick-off call" },
      { minutes: 120, note: "Design review" },
    ]);
});

test("the day card counts entries with no note, Add notes walks through them with Enter, Not now stays hidden", async ({
  page,
}, info) => {
  await startFreshAccount(page, "Acme");
  await logBare(page, "1h", "1:00");
  await logBare(page, "2h", "2:00");
  await logBare(page, "45m", "0:45");
  const reminder = page.getByRole("region", { name: "Entries with no note" });
  await expect(reminder).toContainText("3 entries have no note yet. Clients see notes on invoices.");
  await shot(page, info.project.name, "4-reminder");

  await test.step("Add notes opens the first one; Enter saves it and opens the next", async () => {
    await reminder.getByRole("button", { name: "Add notes" }).click();
    for (const note of ["First note", "Second note", "Third note"]) {
      const box = page.getByLabel(/^Note for General/);
      await expect(box).toBeFocused();
      await box.fill(note);
      await box.press("Enter");
    }
    await expect(reminder).toHaveCount(0);
    await expect
      .poll(async () => (await serverEntries(page)).map((e) => e.note).sort())
      .toEqual(["First note", "Second note", "Third note"]);
  });

  await test.step("Not now hides it for the day, also after a reload", async () => {
    await logBare(page, "15m", "0:15");
    await expect(reminder).toContainText("1 entry has no note yet.");
    await reminder.getByRole("button", { name: "Not now" }).click();
    await expect(reminder).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Add a note to General 0:15" })).toBeVisible();
    await expect(reminder).toHaveCount(0);
  });
});
