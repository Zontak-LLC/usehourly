import { describe, expect, it } from "vitest";

import { buildInvoice, type InvoiceEntry, isBilledEntry } from "./invoice";

const project = { name: "Website", hourly_rate: 9500, billable: true };
const entry = (over: Partial<InvoiceEntry> = {}): InvoiceEntry => ({
  date: "2026-10-05",
  minutes: 30,
  note: "",
  started_at: null,
  project_id: "p1",
  project,
  ...over,
});

describe("isBilledEntry", () => {
  it("bills a stopped entry with minutes on a billable project", () => {
    expect(isBilledEntry(entry())).toBe(true);
  });

  it.each([
    ["a non-billable project", { project: { ...project, billable: false } }],
    ["an empty entry", { minutes: 0 }],
    ["a running timer", { started_at: new Date("2026-10-05T09:00:00Z") }],
  ])("does not bill %s", (_name, over) => {
    expect(isBilledEntry(entry(over))).toBe(false);
  });

  it("is the rule buildInvoice bills by, and keeps counting what it left out", () => {
    const entries = [
      entry(),
      entry({ minutes: 0 }),
      entry({ minutes: 40, project: { ...project, billable: false } }),
      entry({ started_at: "2026-10-05T09:00:00Z" }),
    ];
    const totals = buildInvoice(entries);
    expect(totals.lines.map((l) => l.minutes)).toEqual([entries.filter(isBilledEntry)[0].minutes]);
    expect(totals.skippedMinutes).toBe(40);
    expect(totals.runningTimers).toBe(1);
  });
});
