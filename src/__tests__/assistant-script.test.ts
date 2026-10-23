import { describe, expect, it } from "vitest";

import { FINISHED, FINISHED_TEXT, SCRIPT, type Seg, TOOLS_SHOWN } from "@/lib/assistant-script";

const said = (s: Seg) => (s.k === "pause" ? "" : s.t);

import { readFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync("bridge/catalog.json", "utf8")) as { tools: { name: string }[] };

describe("the home page terminal scene", () => {
  it("only shows tools the MCP server really has, and shows each of them", () => {
    const real = new Set(catalog.tools.map((t) => t.name));
    const called = SCRIPT.filter((s) => s.k === "line" && s.c === "tool" && /^[a-z_]+$/.test(said(s))).map(said);
    expect(called.length).toBeGreaterThanOrEqual(TOOLS_SHOWN.length);
    for (const name of called) expect(real.has(name), `${name} is not an MCP tool`).toBe(true);
    for (const name of TOOLS_SHOWN) expect(called).toContain(name);
  });

  it("its numbers add up: 12:30 + 10:00 (8:00 plus the 2 hours logged) + 14:30 = 37 hours", () => {
    expect(FINISHED_TEXT).toContain("12:30 h");
    expect(FINISHED_TEXT).toContain("8:00 h");
    expect(FINISHED_TEXT).toContain("14:30 h");
    expect(FINISHED_TEXT).toContain("2h");
    expect(12.5 + (8 + 2) + 14.5).toBe(37);
    expect(FINISHED_TEXT).toContain("37 hours, 3 invoices, $3,310.00");
    // 12:30 at $100, 10:00 at $90, 14:30 at $80
    expect(12.5 * 100 + 10 * 90 + 14.5 * 80).toBe(3310);
    for (const amount of ["$1,250.00", "$900.00", "$1,160.00"]) expect(FINISHED_TEXT).toContain(amount);
  });

  it("asks before it bills: the question comes before the invoice call, and the answer is typed by the person", () => {
    const text = FINISHED_TEXT;
    expect(text.indexOf("Should I add something")).toBeGreaterThan(-1);
    expect(text.indexOf("Should I add something")).toBeLessThan(text.indexOf("create_invoice"));
    const typed = SCRIPT.filter((s) => s.k === "type" && s.c === "you").map(said);
    expect(typed).toHaveLength(2);
  });

  it("shows three invoices with numbers in a row, no hidden feature, and a finished screen without pauses", () => {
    const made = FINISHED.filter((p) => p.c === "link").map((p) => p.t);
    expect(made).toHaveLength(3);
    for (const [n, l] of made.entries()) expect(l).toMatch(new RegExp(`^INV-2026-01${4 + n}  \\$[\\d,]+\\.00\\n*$`));
    // sign-off links are switched off in this release, so the scene never shows one
    expect(FINISHED_TEXT).not.toMatch(/timesheet\/|share_timesheet|sign-off/);
    expect(FINISHED.every((p) => typeof p.t === "string")).toBe(true);
  });
});
