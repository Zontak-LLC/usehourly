import { describe, expect, it, vi } from "vitest";

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** A tiny stand-in for the database: clients belonging to two accounts, filtered the way Prisma would. */
function mockPrisma() {
  const clients = [
    { id: "c1", user_id: "u1", name: "Acme", logo: PNG },
    { id: "c2", user_id: "u1", name: "Globex", logo: null as string | null },
    { id: "c3", user_id: "u2", name: "Initech", logo: PNG },
  ];
  return {
    clients,
    client: {
      findMany: vi.fn(async (a: { where: { user_id: string; logo?: unknown } }) =>
        clients.filter((c) => c.user_id === a.where.user_id && (a.where.logo ? c.logo !== null : true)),
      ),
      updateMany: vi.fn(async (a: { where: { id: string; user_id: string }; data: { logo: string | null } }) => {
        const hit = clients.filter((c) => c.id === a.where.id && c.user_id === a.where.user_id);
        for (const c of hit) c.logo = a.data.logo;
        return { count: hit.length };
      }),
    },
  };
}
const as = (userId: string, prisma: ReturnType<typeof mockPrisma>) =>
  createCaller({ session: { user: { id: userId }, expires: "" }, prisma: prisma as never });

describe("a freelancer puts a logo on a client card", () => {
  it("lists logos by client id for their own clients only, and leaves out clients without one", async () => {
    const prisma = mockPrisma();
    expect(await as("u1", prisma).clients.logos()).toEqual({ c1: PNG });
    expect(await as("u2", prisma).clients.logos()).toEqual({ c3: PNG });
    const where = prisma.client.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ user_id: "u1", logo: { not: null } });
  });

  it("adds a logo to a client that has none, then replaces it, then clears it", async () => {
    const prisma = mockPrisma();
    const owner = as("u1", prisma);
    expect(await owner.clients.setLogo({ id: "c2", logo: PNG })).toEqual({ ok: true });
    expect(await owner.clients.logos()).toEqual({ c1: PNG, c2: PNG });

    const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
    await owner.clients.setLogo({ id: "c2", logo: jpeg });
    expect((await owner.clients.logos()).c2).toBe(jpeg);

    await owner.clients.setLogo({ id: "c2", logo: null });
    expect(await owner.clients.logos()).toEqual({ c1: PNG });
  });

  it("cannot touch someone else's client: NOT_FOUND, and their logo is unchanged", async () => {
    const prisma = mockPrisma();
    await expect(as("u1", prisma).clients.setLogo({ id: "c3", logo: null })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(prisma.clients.find((c) => c.id === "c3")?.logo).toBe(PNG);
    // the write itself is limited to the signed-in account's own rows, not just rejected afterwards
    expect(prisma.client.updateMany.mock.calls[0][0].where).toEqual({ id: "c3", user_id: "u1" });
    await expect(as("u1", prisma).clients.setLogo({ id: "nope", logo: PNG })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses anything that is not a small PNG or JPEG, before the database is touched", async () => {
    const prisma = mockPrisma();
    const owner = as("u1", prisma);
    for (const logo of [
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "data:text/html;base64,PGgxPmhpPC9oMT4=",
      "javascript:alert(1)",
      "https://example.com/logo.png",
      `data:image/png;base64,${"A".repeat(300_001)}`,
    ]) {
      await expect(owner.clients.setLogo({ id: "c1", logo })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
    expect(prisma.clients[0].logo).toBe(PNG);
  });

  it("needs a signed-in account for both", async () => {
    const prisma = mockPrisma();
    const anonymous = createCaller({ session: null, prisma: prisma as never });
    await expect(anonymous.clients.logos()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anonymous.clients.setLogo({ id: "c1", logo: null })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(prisma.client.findMany).not.toHaveBeenCalled();
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
  });
});
