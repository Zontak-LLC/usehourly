import { describe, expect, it } from "vitest";

import { planThemeSync, readSavedTheme } from "@/lib/theme-sync";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

type Row = { id: string; theme_mode: string | null };

/** Two accounts in an in-memory table; update() only touches the row it is asked to. */
function fakeDb() {
  const rows: Row[] = [
    { id: "u1", theme_mode: null },
    { id: "u2", theme_mode: "dark" },
  ];
  return {
    rows,
    prisma: {
      authUser: {
        update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
          const row = rows.find((r) => r.id === where.id);
          if (!row) throw new Error("no such user");
          Object.assign(row, data);
          return row;
        },
      },
    },
  };
}

const as = (db: ReturnType<typeof fakeDb>, id: string, demo = false) =>
  createCaller({
    session: { user: { id, ...(demo ? { demo: true } : {}) }, expires: "" } as never,
    prisma: db.prisma as never,
  });

describe("light/dark follows the account", () => {
  it("saves a choice on the account and leaves everyone else's alone", async () => {
    const db = fakeDb();
    const out = await as(db, "u1").account.setTheme({ mode: "light" });
    expect(out).toEqual({ saved: true });
    expect(db.rows[0]).toMatchObject({ theme_mode: "light" });
    expect(db.rows[1]).toMatchObject({ theme_mode: "dark" }); // never leaks between users
  });

  it("rejects modes it does not know, saving nothing", async () => {
    const db = fakeDb();
    await expect(as(db, "u1").account.setTheme({ mode: "neon" })).rejects.toThrow();
    expect(db.rows[0]).toMatchObject({ theme_mode: null });
  });

  it("ignores a colour sent by an old browser: nothing is saved, and the colour column is never written", async () => {
    const db = fakeDb();
    const out = await as(db, "u1").account.setTheme({ preset: "coral" } as never);
    expect(out).toEqual({ saved: false });
    expect(db.rows[0]).toEqual({ id: "u1", theme_mode: null });
  });

  it("keeps a demo account's choice in its browser only", async () => {
    const db = fakeDb();
    const out = await as(db, "u1", true).account.setTheme({ mode: "dark" });
    expect(out).toEqual({ saved: false });
    expect(db.rows[0].theme_mode).toBeNull();
  });

  it("is for signed-in accounts only", async () => {
    const db = fakeDb();
    const anon = createCaller({ session: null, prisma: db.prisma as never });
    await expect(anon.account.setTheme({ mode: "dark" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.rows[0].theme_mode).toBeNull();
  });

  it("ignores a stored value this version does not know, and the old colour column", () => {
    expect(readSavedTheme({ theme_mode: "nonsense" })).toEqual({ mode: null });
    expect(readSavedTheme({ theme_mode: "dark", theme_preset: "coral" } as never)).toEqual({ mode: "dark" });
    expect(readSavedTheme({})).toEqual({ mode: null });
  });

  it("a new device takes the account's choice; a first sign-in uploads a real choice from the browser", () => {
    // Laptop chose dark; the phone opens with the default and receives it.
    expect(planThemeSync({ mode: "dark" }, { mode: "light" })).toEqual({ apply: { mode: "dark" }, save: {} });
    // Already in step: nothing to do.
    expect(planThemeSync({ mode: "dark" }, { mode: "dark" })).toEqual({ apply: {}, save: {} });
    // An account that never stored a choice adopts what this browser already uses...
    expect(planThemeSync({ mode: null }, { mode: "system" })).toEqual({ apply: {}, save: { mode: "system" } });
    // ...but the default is not a choice, so nothing is uploaded for it.
    expect(planThemeSync({ mode: null }, { mode: "light" })).toEqual({ apply: {}, save: {} });
  });
});
