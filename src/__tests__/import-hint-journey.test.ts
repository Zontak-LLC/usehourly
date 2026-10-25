import { describe, expect, it } from "vitest";

import { IMPORT_HINT_HREF, importHintKey, showImportHint } from "@/lib/import-hint";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

/** A tiny entry store whose findFirst honours `where.user_id` and `select`, like Prisma does. */
function memoryEntries(rows: { id: string; user_id: string }[]) {
  return {
    timeEntry: {
      findFirst: async ({ where, select }: { where?: { user_id?: string }; select?: { id?: boolean } }) => {
        const row = rows.find((r) => where?.user_id === undefined || r.user_id === where.user_id);
        if (!row) return null;
        return select ? { id: row.id } : row;
      },
    },
  };
}

const asCaller = (prisma: ReturnType<typeof memoryEntries>, userId: string | null) =>
  createCaller({ session: userId ? { user: { id: userId }, expires: "" } : null, prisma: prisma as never });

const base = { importOn: true, hasEntries: false, weekHasEntries: false, dismissed: false };

describe("Today's import hint (issue 326)", () => {
  it("shows for a new account with no entries while the import is on", () => {
    expect(showImportHint(base)).toBe(true);
  });

  it("never shows when the import switch is off (the link would lead nowhere)", () => {
    expect(showImportHint({ ...base, importOn: false })).toBe(false);
  });

  it("goes once the account has entries, logged or imported", () => {
    expect(showImportHint({ ...base, hasEntries: true })).toBe(false);
  });

  it("goes at once when the week Today holds gets its first entry, before hasAny is fetched again", () => {
    expect(showImportHint({ ...base, weekHasEntries: true })).toBe(false);
  });

  it("stays hidden while hasAny is unknown, so it never flashes", () => {
    expect(showImportHint({ ...base, hasEntries: undefined })).toBe(false);
  });

  it("goes after Not now", () => {
    expect(showImportHint({ ...base, dismissed: true })).toBe(false);
  });

  it("remembers Not now per account and links to Your data", () => {
    expect(importHintKey("u1")).toBe("hourly:importHint:u1");
    expect(importHintKey("u2")).not.toBe(importHintKey("u1"));
    expect(IMPORT_HINT_HREF).toBe("/dashboard/account#data");
  });
});

describe("entry.hasAny", () => {
  it("is false for an empty account and true once it has an entry", async () => {
    expect(await asCaller(memoryEntries([]), "u1").entry.hasAny()).toBe(false);
    expect(await asCaller(memoryEntries([{ id: "e1", user_id: "u1" }]), "u1").entry.hasAny()).toBe(true);
  });

  it("does not see another account's entries", async () => {
    const prisma = memoryEntries([{ id: "e1", user_id: "someone-else" }]);
    expect(await asCaller(prisma, "u1").entry.hasAny()).toBe(false);
  });

  it("refuses a signed-out caller", async () => {
    await expect(asCaller(memoryEntries([]), null).entry.hasAny()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
