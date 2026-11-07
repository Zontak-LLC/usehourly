import type { Page } from "@playwright/test";

import { expect, savedInvoices, saveReviewedInvoice, seedFirstDay, seen, test, today, trpc } from "./helpers";

/**
 * New invoice while a timer runs (issue 431, snag 3). A first-day tester's only time was a running timer, so Create
 * invoice stayed grey: a running entry holds 0 stored minutes and made no invoice line. Now the button works and asks
 * "Stop it and include it" or "Leave it running and invoice without it". Mockup: docs/design/invoice-running-timer.html.
 */

type Running = { id: string } | null;

const running = async (page: Page) => {
  const res = await page.request.get("/api/trpc/entry.running");
  expect(res.ok(), `entry.running answered ${res.status()}`).toBe(true);
  return ((await res.json()) as { result: { data: Running } }).result.data;
};
const startTimer = (page: Page, projectId: string) => trpc(page, "entry.start", { projectId, date: today(), note: "" });

const createButton = (page: Page) => page.getByRole("button", { name: "Preview invoice" });
const choice = (page: Page) => page.getByRole("dialog");
const stopAndInclude = (page: Page) => choice(page).getByRole("button", { name: "Stop it and include it" });
const leaveRunning = (page: Page) =>
  choice(page).getByRole("button", { name: "Leave it running and invoice without it" });

async function openNewInvoice(page: Page) {
  await page.goto("/dashboard/invoices/new");
  await expect(page.getByRole("heading", { name: "New invoice" })).toBeVisible();
}

/** The stopped hour at $60 and a timer running beside it on the same project (cases 2 to 4). */
async function hourAndTimer(page: Page) {
  const { projectId } = await seedFirstDay(page, { rate: 6000, minutes: [60] });
  await startTimer(page, projectId);
  await openNewInvoice(page);
  await expect(seen(page, "$60.00")).toBeVisible();
}

test("case 1: the timer is the only time, so Stop it and include it makes the invoice", async ({
  page,
  shot,
  audit,
}) => {
  // `entry.shiftStart` refuses to move a start into the day before: skip the half hour after midnight.
  const minutesIntoDay = await page.evaluate(() => new Date().getHours() * 60 + new Date().getMinutes());
  test.skip(minutesIntoDay < 35, "the timer cannot start 30 minutes earlier this soon after midnight");
  const { projectId } = await seedFirstDay(page, { rate: 6000, minutes: [] });
  await startTimer(page, projectId);
  // Only `started_at` moves: the entry still holds 0 stored minutes, which is what greyed the button out before.
  await trpc(page, "entry.shiftStart", { minutes: 30, tzOffset: new Date().getTimezoneOffset() });
  await openNewInvoice(page);

  await expect(createButton(page)).toBeEnabled();
  await expect(
    page.getByText("⚠ A timer is running. Its time is not on this invoice until you stop it."),
  ).toBeVisible();
  await createButton(page).click();
  await expect(choice(page).getByRole("heading", { name: /^A timer is running \(0:3\d on General\)$/ })).toBeVisible();
  await expect(choice(page).getByText("This timer is the only time to bill so far.")).toBeVisible();
  await expect(leaveRunning(page)).toHaveCount(0);
  await shot("only-time");
  await audit("new invoice, timer is the only time");

  await stopAndInclude(page).click();
  const download = await saveReviewedInvoice(page);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  await expect(page).toHaveURL(/\/dashboard\/invoices$/);
  await expect(page.getByText(`INV-${new Date().getFullYear()}-001`).first()).toBeVisible();
  expect(await running(page)).toBeNull();
  const [made] = await savedInvoices(page);
  expect(made.total_minutes).toBeGreaterThanOrEqual(30);
});

test("case 2: Leave it running bills the stopped hour and keeps the timer", async ({ page, shot }) => {
  await hourAndTimer(page);
  await expect(
    page.getByText("⚠ A timer is running. Its time is not on this invoice until you stop it."),
  ).toBeVisible();
  await createButton(page).click();
  await expect(choice(page).getByRole("heading", { name: /^A timer is running \(0:0\d on General\)$/ })).toBeVisible();
  await expect(stopAndInclude(page)).toBeVisible();
  await shot("other-time");

  await leaveRunning(page).click();
  const download = await saveReviewedInvoice(page);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  await expect(page).toHaveURL(/\/dashboard\/invoices$/);
  const [made] = await savedInvoices(page);
  expect(made.total_cents).toBe(6000);
  expect(await running(page)).not.toBeNull();
});

test("case 3: Escape changes nothing; then Stop it and include it bills the timer too", async ({ page }) => {
  await hourAndTimer(page);
  await createButton(page).click();
  await expect(stopAndInclude(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(choice(page)).toBeHidden();
  expect(await savedInvoices(page)).toEqual([]);
  expect(await running(page)).not.toBeNull();

  await createButton(page).click();
  await stopAndInclude(page).click();
  const download = await saveReviewedInvoice(page);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  await expect(page).toHaveURL(/\/dashboard\/invoices$/);
  const [made] = await savedInvoices(page);
  expect(made.total_cents).toBeGreaterThan(6000); // the stopped timer adds at least a minute
  expect(made.total_minutes).toBeGreaterThan(60);
  expect(await running(page)).toBeNull();
});

test("case 4: the stop fails, so no invoice is made and the choice stays open", async ({ page }) => {
  await hourAndTimer(page);
  await createButton(page).click();
  await expect(stopAndInclude(page)).toBeVisible();
  await trpc(page, "entry.stop", {}); // stopped on another device meanwhile
  // The page's own stop then gets the server's real "No timer is running." answer. It is a 404, which the browser logs
  // as an error and the run counts; it is passed on as a 400 (the app saying no), body untouched.
  await page.route("**/api/trpc/entry.stop*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, status: response.status() === 404 ? 400 : response.status() });
  });
  await stopAndInclude(page).click();

  await expect(page.getByText("No timer is running.")).toBeVisible();
  await expect(choice(page)).toBeVisible();
  await expect(stopAndInclude(page)).toBeEnabled();
  await expect(leaveRunning(page)).toBeEnabled();
  await expect(page).toHaveURL(/\/dashboard\/invoices\/new/);
  expect(await savedInvoices(page)).toEqual([]);
});

test("case 5: a timer under a minute has nothing to bill yet", async ({ page, shot }) => {
  const { projectId } = await seedFirstDay(page, { rate: 6000, minutes: [] });
  await startTimer(page, projectId);
  await openNewInvoice(page);
  await createButton(page).click();
  await expect(choice(page).getByText("This timer has run less than a minute. Nothing to bill yet.")).toBeVisible();
  await expect(stopAndInclude(page)).toHaveCount(0);
  await expect(leaveRunning(page)).toHaveCount(0);
  await shot("under-a-minute");

  await choice(page).getByRole("button", { name: "Keep it running" }).click();
  await expect(choice(page)).toBeHidden();
  expect(await savedInvoices(page)).toEqual([]);
  expect(await running(page)).not.toBeNull();
});

test("case 6: no time and no timer, the button is off and the preview says where to log time", async ({ page }) => {
  await seedFirstDay(page, { rate: 6000, minutes: [] });
  await openNewInvoice(page);
  await expect(createButton(page)).toBeDisabled();
  const empty = page.getByText(
    /No billable time for Acme Studio in this period\. Log time on Today, or pick another period\./,
  );
  await expect(empty).toBeVisible();
  await empty.getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/dashboard\/today/);
});
