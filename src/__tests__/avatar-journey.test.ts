import { describe, expect, it, vi } from "vitest";

import { initialsOf } from "@/lib/initials";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

/** The picture beside the name in the top bar: set, removed, never someone else's, small and an image only. */

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function setup(demo = false) {
  const prisma = { authUser: { update: vi.fn(async () => ({ id: "u1" })) } };
  const session = { user: { id: "u1", ...(demo ? { demo: true } : {}) }, expires: "" };
  return { prisma, caller: createCaller({ session, prisma: prisma as never }) };
}

describe("the picture in the top bar", () => {
  it("is saved on the signed-in account only, and cleared with null", async () => {
    const { prisma, caller } = setup();
    expect(await caller.account.setAvatar({ avatar: PNG })).toEqual({ saved: true });
    expect(prisma.authUser.update).toHaveBeenLastCalledWith({ where: { id: "u1" }, data: { avatar: PNG } });
    await caller.account.setAvatar({ avatar: null });
    expect(prisma.authUser.update).toHaveBeenLastCalledWith({ where: { id: "u1" }, data: { avatar: null } });
  });

  it("refuses anything but a small PNG or JPEG data address, and writes nothing", async () => {
    const { prisma, caller } = setup();
    for (const bad of [
      "https://example.com/me.png", // no outside addresses: the page never loads another site's image
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", // no SVG: it can carry script
      "data:text/html;base64,PGgxPmhpPC9oMT4=",
      "javascript:alert(1)",
      `data:image/png;base64,${"A".repeat(60_001)}`, // too large
      "",
    ]) {
      await expect(caller.account.setAvatar({ avatar: bad })).rejects.toThrow();
    }
    expect(prisma.authUser.update).not.toHaveBeenCalled();
  });

  it("is refused for a sample-data account and for a signed-out caller", async () => {
    const demo = setup(true);
    await expect(demo.caller.account.setAvatar({ avatar: PNG })).rejects.toThrow(/Create a free account/);
    expect(demo.prisma.authUser.update).not.toHaveBeenCalled();
    const { prisma } = setup();
    const anon = createCaller({ session: null, prisma: prisma as never });
    await expect(anon.account.setAvatar({ avatar: PNG })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(prisma.authUser.update).not.toHaveBeenCalled();
  });
});

describe("initials", () => {
  it("are the first and last word's first letters, capitalised, or a question mark when there is no name", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("  denis   zontak ")).toBe("DZ");
    expect(initialsOf("Jean Claude Van Damme")).toBe("JD");
    expect(initialsOf("ada")).toBe("A");
    expect(initialsOf("élodie Martin")).toBe("ÉM");
    expect(initialsOf("")).toBe("?");
    expect(initialsOf(null)).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });
});
