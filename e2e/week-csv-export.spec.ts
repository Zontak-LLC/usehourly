import type { Page } from "@playwright/test";

import { expect, startFreshAccount, test } from "./helpers";
import { readFileSync } from "node:fs";

/**
 * "Download this week as CSV" in Week's Export menu (and the same item on Month): the file holds the entries the page
 * shows (after the project filter), with the Excel rules (no 0-minute entries, so no just-started timer). The week of
 * Monday, September 7, 2026 is used, so the dates never depend on today.
 */
const WEEK = "/dashboard/week?date=2026-09-08";
const HEADER = "Date,Client,Project,Note,Hours,Minutes,Billable,Rate (per hour),Amount,Currency";

async function call<T>(page: Page, path: string, data: unknown): Promise<T> {
  const res = await page.request.post(`/api/trpc/${path}`, { data });
  expect(res.ok(), `${path} answered ${res.status()}`).toBe(true);
  return ((await res.json()) as { result: { data: T } }).result.data;
}

/** A new account (currency USD) with client Acme and its project General, billable at $100 an hour. */
async function seed(page: Page) {
  await startFreshAccount(page, "Acme");
  const res = await page.request.get("/api/trpc/clients.list");
  const clients = ((await res.json()) as { result: { data: { id: string; projects: { id: string }[] }[] } }).result
    .data;
  const general = clients[0].projects[0].id;
  await call(page, "project.update", { id: general, hourlyRate: 10000, billable: true });
  const add = (projectId: string, date: string, minutes: number, note: string) =>
    call(page, "entry.create", { projectId, date, minutes, note });
  return { clientId: clients[0].id, general, add };
}

/** Opens Export, picks the CSV item and returns the file's name and its lines (the UTF-8 BOM taken off). */
async function downloadCsv(page: Page, period: "week" | "month" = "week") {
  await page.getByRole("button", { name: /^(Share & export|Export)$/ }).click();
  const item = page.getByRole("menuitem", { name: `Download this ${period} as CSV` });
  await expect(item).not.toHaveAttribute("aria-disabled", "true");
  const [download] = await Promise.all([page.waitForEvent("download"), item.click()]);
  const text = readFileSync(await download.path(), "utf8");
  expect(text.startsWith("﻿"), "the file starts with a UTF-8 BOM").toBe(true);
  const lines = text.slice(1).split("\r\n").filter(Boolean);
  return { name: download.suggestedFilename(), lines };
}

test("the week's CSV has its name, the header and one row per entry the page shows", async ({ page }) => {
  const { general, add } = await seed(page);
  await add(general, "2026-09-08", 90, "Design");
  await add(general, "2026-09-09", 30, "=1+1"); // would run as a formula in a spreadsheet
  await call(page, "entry.start", { projectId: general, date: "2026-09-10", note: "Still running" });

  await page.goto(WEEK);
  await expect(page.getByRole("region", { name: "All entries this week" })).toContainText("Design");
  const { name, lines } = await downloadCsv(page);

  expect(name).toBe("usehourly-2026-09-07_to_2026-09-13.csv");
  expect(lines[0]).toBe(HEADER);
  expect(lines[1]).toBe("2026-09-08,Acme,General,Design,1.5,90,Yes,100,150,USD");
  expect(lines[2]).toBe("2026-09-09,Acme,General,'=1+1,0.5,30,Yes,100,50,USD");
  // The timer that just started holds 0 minutes, so it is left out, as in the Excel file.
  expect(lines).toHaveLength(3);
  expect(lines.join("\n")).not.toContain("Still running");
});

test("with a project filter the CSV holds only that project's entries", async ({ page }) => {
  const { clientId, general, add } = await seed(page);
  const other = await call<{ id: string }>(page, "project.create", { clientId, name: "Support", hourlyRate: 5000 });
  await add(general, "2026-09-08", 60, "General work");
  await add(other.id, "2026-09-08", 45, "Call");
  await add(other.id, "2026-09-11", 15, "Email");

  await page.goto(`${WEEK}&project=${other.id}`);
  const list = page.getByRole("region", { name: "All entries this week" });
  await expect(list).toContainText("Email");
  await expect(list).not.toContainText("General work");
  const { lines } = await downloadCsv(page);

  const rows = lines.slice(1);
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(row.split(",")[2]).toBe("Support");
});

test("after ‹ the CSV is the previous week's, by name and by content", async ({ page }) => {
  const { general, add } = await seed(page);
  await add(general, "2026-09-08", 90, "This week");
  await add(general, "2026-09-02", 60, "Week before");

  await page.goto(WEEK);
  await expect(page.getByRole("region", { name: "All entries this week" })).toContainText("This week");
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.getByRole("region", { name: "All entries this week" })).toContainText("Week before");
  const { name, lines } = await downloadCsv(page);

  expect(name).toBe("usehourly-2026-08-31_to_2026-09-06.csv");
  expect(lines).toEqual([HEADER, "2026-09-02,Acme,General,Week before,1,60,Yes,100,100,USD"]);
});

test("the CSV item waits for the entries, and Month offers the month's CSV", async ({ page }) => {
  const { general, add } = await seed(page);
  await add(general, "2026-09-08", 90, "Design");

  // Hold the week's entries: the item stays off until they arrive.
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  const entryList = (url: URL) => url.pathname.includes("entry.list");
  await page.route(entryList, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(WEEK);
  await page.getByRole("button", { name: /^(Share & export|Export)$/ }).click();
  const item = page.getByRole("menuitem", { name: "Download this week as CSV" });
  await expect(item).toHaveAttribute("aria-disabled", "true");
  release();
  await expect(item).not.toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await page.unroute(entryList);

  await page.goto("/dashboard/month?month=2026-09");
  const { name, lines } = await downloadCsv(page, "month");
  expect(name).toBe("usehourly-2026-09.csv");
  expect(lines).toEqual([HEADER, "2026-09-08,Acme,General,Design,1.5,90,Yes,100,150,USD"]);
});
