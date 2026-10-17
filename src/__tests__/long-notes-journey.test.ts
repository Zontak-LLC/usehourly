import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InvoiceSnapshot } from "@/lib/invoice";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { fitPaste, isLongNote, NOTE_COMPACT_CHARS, NOTE_MAX, NOTE_WARN_AT, noteCounter, shortNote } from "@/lib/notes";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

function mockPrisma() {
  return {
    project: { findFirst: vi.fn(async () => ({ id: "p1" })) },
    timeEntry: {
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }) => ({ id: "e1", ...data })),
      findFirst: vi.fn(async () => ({ id: "e1", user_id: "u1" })),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ data }) => data),
      updateMany: vi.fn(async () => ({ count: 1 })),
      deleteMany: vi.fn(),
    },
    authUser: { findUnique: vi.fn(), create: vi.fn() },
  };
}
type P = ReturnType<typeof mockPrisma>;
const asUser = (prisma: P) => createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });

describe("long description journey", () => {
  let prisma: P;
  beforeEach(() => {
    prisma = mockPrisma();
  });

  it("stores a 1,800-character description (the old 500 limit is gone)", async () => {
    const note = "x".repeat(1800);
    await asUser(prisma).entry.create({ projectId: "p1", date: "2026-10-09", minutes: 60, note });
    expect(prisma.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ note, minutes: 60 }) }),
    );
  });

  it("rejects a description over the limit and never writes it", async () => {
    await expect(
      asUser(prisma).entry.create({
        projectId: "p1",
        date: "2026-10-09",
        minutes: 60,
        note: "y".repeat(NOTE_MAX + 1),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("shows a counter only when the note is close to the limit", () => {
    expect(noteCounter(NOTE_WARN_AT - 1)).toBeNull();
    expect(noteCounter(NOTE_WARN_AT)).toBe(`${NOTE_WARN_AT.toLocaleString("en-US")} / 2,000`);
    expect(noteCounter(NOTE_MAX)).toBe("2,000 / 2,000");
  });

  it("keeps what fits from an oversized paste and reports how much was left out", () => {
    const current = "a".repeat(1900);
    expect(fitPaste(current, 0, "b".repeat(250))).toEqual({ text: "b".repeat(100), dropped: 150 });
    // Replacing a selection frees room.
    expect(fitPaste(current, 200, "b".repeat(250))).toEqual({ text: "b".repeat(250), dropped: 0 });
    // A full box accepts nothing.
    expect(fitPaste("a".repeat(NOTE_MAX), 0, "zzz")).toEqual({ text: "", dropped: 3 });
  });

  it("folds long or multi-line notes in lists but leaves short ones alone", () => {
    expect(isLongNote("fixed the header")).toBe(false);
    expect(isLongNote("one line\nsecond line")).toBe(false);
    expect(isLongNote("a\nb\nc")).toBe(true);
    expect(isLongNote("w".repeat(200))).toBe(true);
  });

  it("shortens a note to its first line for compact invoices", () => {
    expect(shortNote("Short note")).toBe("Short note");
    expect(shortNote("Intro line\n- detail 1\n- detail 2")).toBe("Intro line ...");
    const cut = shortNote("z".repeat(300));
    expect(cut.length).toBeLessThanOrEqual(NOTE_COMPACT_CHARS);
    expect(cut.endsWith("...")).toBe(true);
  });

  function snapshot(over: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot {
    const long = `Store features\n${"- a very detailed bullet point about the work\n".repeat(20)}END-OF-NOTE`;
    return {
      seller: { name: "Jo", ein: null, address: null, email: "jo@example.com", logo: null },
      client: { name: "Acme" },
      number: "INV-9",
      issueDate: "2026-10-31",
      dueDate: null,
      periodFrom: "2026-10-01",
      periodTo: "2026-10-31",
      notes: "",
      includeDetail: true,
      lines: [{ projectId: "p1", project: "Website", minutes: 120, rateCents: 10000, amountCents: 20000 }],
      detail: [
        { date: "2026-10-02", project: "Website", note: long, minutes: 60 },
        { date: "2026-10-03", project: "Website", note: "Store features\nother", minutes: 60 },
      ],
      totalMinutes: 120,
      totalCents: 20000,
      ...over,
    };
  }

  it("renders a full long note on the invoice (summary and time detail)", async () => {
    const doc = await buildInvoicePdf(snapshot());
    const text = doc.output();
    expect(text.match(/END-OF-NOTE/g)?.length).toBe(2); // line items + time detail
  });

  it("compact invoices keep the summary short but the time detail complete", async () => {
    const doc = await buildInvoicePdf(snapshot({ compactNotes: true }));
    const text = doc.output();
    expect(text.match(/END-OF-NOTE/g)?.length).toBe(1); // only the time detail
    // Both notes start with "Store features", so the summary shows that line once.
    expect(text.match(/Store features \.\.\./g)?.length).toBe(1);
  });
});
