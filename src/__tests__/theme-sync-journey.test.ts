import { describe, expect, it } from "vitest";

import { planThemeSync, readSavedTheme } from "@/lib/theme-sync";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

type Row = { id: string; theme_preset: string | null; theme_mode: string | null };

/** Two accounts in an in-memory table; update() only touches the row it is asked to. */
function fakeDb() {
  const rows: Row[] = [
    { id: "u1", theme_preset: null, theme_mode: null },
    { id: "u2", theme_preset: "sky", theme_mode: "dark" },
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

describe("colour and light/dark follow the account", () => {
  it("saves a choice on the account and leaves everyone else's alone", async () => {
    const db = fakeDb();
    const out = await as(db, "u1").account.setTheme({ preset: "coral", mode: "light" });
    expect(out).toEqual({ saved: true });
    expect(db.rows[0]).toMatchObject({ theme_preset: "coral", theme_mode: "light" });
    expect(db.rows[1]).toMatchObject({ theme_preset: "sky", theme_mode: "dark" }); // never leaks between users
  });

  it("changes one field without wiping the other", async () => {
    const db = fakeDb();
    await as(db, "u2").account.setTheme({ mode: "light" });
    expect(db.rows[1]).toMatchObject({ theme_preset: "sky", theme_mode: "light" });
    await as(db, "u2").account.setTheme({ preset: "lilac" });
    expect(db.rows[1]).toMatchObject({ theme_preset: "lilac", theme_mode: "light" });
  });

  it("rejects colours and modes it does not know, saving nothing", async () => {
    const db = fakeDb();
    await expect(as(db, "u1").account.setTheme({ preset: "hot-pink" })).rejects.toThrow();
    await expect(as(db, "u1").account.setTheme({ mode: "neon" })).rejects.toThrow();
    await expect(as(db, "u1").account.setTheme({ preset: "<script>" })).rejects.toThrow();
    expect(db.rows[0]).toMatchObject({ theme_preset: null, theme_mode: null });
  });

  it("keeps a demo account's choice in its browser only", async () => {
    const db = fakeDb();
    const out = await as(db, "u1", true).account.setTheme({ preset: "mint" });
    expect(out).toEqual({ saved: false });
    expect(db.rows[0].theme_preset).toBeNull();
  });

  it("is for signed-in accounts only", async () => {
    const db = fakeDb();
    const anon = createCaller({ session: null, prisma: db.prisma as never });
    await expect(anon.account.setTheme({ preset: "mint" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.rows[0].theme_preset).toBeNull();
  });

  it("ignores a stored value this version no longer knows (an old preset such as indigo)", () => {
    expect(readSavedTheme({ theme_preset: "indigo", theme_mode: "dark" })).toEqual({ preset: null, mode: "dark" });
    expect(readSavedTheme({ theme_preset: "coral", theme_mode: "nonsense" })).toEqual({ preset: "coral", mode: null });
    expect(readSavedTheme({})).toEqual({ preset: null, mode: null });
  });

  it("a new device takes the account's choice; a first sign-in uploads a real choice from the browser", () => {
    // Laptop chose Sky + dark; the phone opens with defaults and receives them.
    expect(planThemeSync({ preset: "sky", mode: "dark" }, { preset: "default", mode: "light" })).toEqual({
      apply: { preset: "sky", mode: "dark" },
      save: {},
    });
    // Already in step: nothing to do.
    expect(planThemeSync({ preset: "sky", mode: "dark" }, { preset: "sky", mode: "dark" })).toEqual({
      apply: {},
      save: {},
    });
    // An account that never stored a choice adopts what this browser already uses...
    expect(planThemeSync({ preset: null, mode: null }, { preset: "mint", mode: "system" })).toEqual({
      apply: {},
      save: { preset: "mint", mode: "system" },
    });
    // ...but defaults are not a choice, so nothing is uploaded for them.
    expect(planThemeSync({ preset: null, mode: null }, { preset: "default", mode: "light" })).toEqual({
      apply: {},
      save: {},
    });
    // Mixed: the account's colour wins, its missing mode comes from the browser.
    expect(planThemeSync({ preset: "cream", mode: null }, { preset: "mint", mode: "dark" })).toEqual({
      apply: { preset: "cream" },
      save: { mode: "dark" },
    });
  });
});
