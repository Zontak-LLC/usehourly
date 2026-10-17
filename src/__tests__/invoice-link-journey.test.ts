import { describe, expect, it, vi } from "vitest";

import { LINK_EXPIRY_DAYS, linkStatus, MAX_LIVE_LINKS, MAX_LIVE_LINKS_PER_INVOICE } from "@/lib/invoice-link";
import { accessDecision } from "@/lib/route-access";
import { findInvoiceLinkByToken } from "@/server/invoice-link";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);
const nowS = () => Math.floor(Date.now() / 1000);

type Link = {
  id: string;
  user_id: string;
  invoice_id: string;
  token_hash: string;
  token_prefix: string;
  expires_at: number;
  revoked_at: number | null;
  created_at: Date;
};
type Client = {
  id: string;
  user_id: string;
  name: string;
  legal_name: string | null;
  address: string | null;
  email: string | null;
  logo: string | null;
};

function world() {
  const invoices = [
    { id: "inv1", user_id: "u1" },
    { id: "inv2", user_id: "u1" },
    { id: "inv3", user_id: "u2" },
  ];
  const clients: Client[] = [
    { id: "c1", user_id: "u1", name: "Acme", legal_name: null, address: null, email: null, logo: null },
    { id: "c2", user_id: "u2", name: "Beta", legal_name: null, address: null, email: "old@beta.com", logo: null },
  ];
  const links: Link[] = [];
  let n = 0;
  const matches = (l: Link, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const val = (l as unknown as Record<string, unknown>)[k];
      if (v && typeof v === "object" && "gt" in v) return (val as number) > (v as { gt: number }).gt;
      return val === v;
    });
  const prisma = {
    invoice: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; user_id: string } }) =>
          invoices.find((i) => i.id === where.id && i.user_id === where.user_id) ?? null,
      ),
    },
    client: {
      findFirst: vi.fn(
        async ({ where }: { where: { id?: string; user_id: string; name?: string } }) =>
          clients.find(
            (c) =>
              c.user_id === where.user_id &&
              (where.id ? c.id === where.id : true) &&
              (where.name ? c.name === where.name : true),
          ) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Client> }) => {
        const c = clients.find((x) => x.id === where.id) as Client;
        Object.assign(c, data);
        return { id: c.id };
      }),
    },
    invoiceLink: {
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) => links.filter((l) => matches(l, where)).length,
      ),
      create: vi.fn(async ({ data }: { data: Omit<Link, "id" | "created_at" | "revoked_at"> }) => {
        const row: Link = { id: `l${++n}`, created_at: new Date(1_000_000 + n), revoked_at: null, ...data };
        links.push(row);
        return { id: row.id };
      }),
      findMany: vi.fn(async ({ where }: { where: { user_id: string; invoice_id: string } }) =>
        links
          .filter((l) => l.user_id === where.user_id && l.invoice_id === where.invoice_id)
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
          .map(({ token_hash: _h, user_id: _u, invoice_id: _i, ...rest }) => rest),
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { token_hash: string } }) =>
          links.find((l) => l.token_hash === where.token_hash) ?? null,
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Link> }) => {
        const hit = links.filter((l) => matches(l, where));
        for (const l of hit) Object.assign(l, data);
        return { count: hit.length };
      }),
    },
  };
  const as = (id: string | null, demo = false) =>
    createCaller({
      session: id ? ({ user: { id, ...(demo ? { demo: true } : {}) }, expires: "" } as never) : null,
      prisma: prisma as never,
    } as never);
  return { invoices, clients, links, prisma, as };
}

describe("a client's email address", () => {
  const full = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: "Acme",
    legalName: "",
    address: "",
    logo: null,
    ...extra,
  });

  it("is saved lowercased, cleared with an empty value, and left alone when not sent", async () => {
    const w = world();
    await w.as("u1").clients.update(full("c1", { email: "  Accounts@Acme.COM " }));
    expect(w.clients[0].email).toBe("accounts@acme.com");
    await w.as("u1").clients.update(full("c1")); // nothing sent about the email: unchanged (this is how older callers still work)
    expect(w.clients[0].email).toBe("accounts@acme.com");
    await w.as("u1").clients.update(full("c1", { email: "" }));
    expect(w.clients[0].email).toBeNull();
  });

  it("refuses a bad or oversized address and changes nothing", async () => {
    const w = world();
    await expect(w.as("u1").clients.update(full("c1", { email: "not-an-email" }))).rejects.toThrow();
    await expect(w.as("u1").clients.update(full("c1", { email: `${"a".repeat(250)}@x.co` }))).rejects.toThrow();
    expect(w.clients[0].email).toBeNull();
    expect(w.prisma.client.update).not.toHaveBeenCalled();
  });

  it("never touches another account's client", async () => {
    const w = world();
    await expect(w.as("u1").clients.update(full("c2", { name: "Beta", email: "evil@x.co" }))).rejects.toThrow(
      /not found/i,
    );
    expect(w.clients[1].email).toBe("old@beta.com");
  });
});

describe("a private link to an invoice", () => {
  it("is made for your own invoice only, and the link is returned once", async () => {
    const w = world();
    const { id, token } = await w.as("u1").invoiceLink.create({ invoiceId: "inv1" });
    expect(token.length).toBeGreaterThan(30);
    const row = w.links.find((l) => l.id === id) as Link;
    expect(row).toMatchObject({ user_id: "u1", invoice_id: "inv1", revoked_at: null });
    expect(row.token_hash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.expires_at - nowS()).toBeGreaterThan(89 * 86_400);
    expect(JSON.stringify(await w.as("u1").invoiceLink.list({ invoiceId: "inv1" }))).not.toContain(token);
    // someone else's invoice id, even if guessed, makes nothing
    await expect(w.as("u1").invoiceLink.create({ invoiceId: "inv3" })).rejects.toThrow(/not found/i);
    expect(w.links).toHaveLength(1);
  });

  it("refuses sample accounts, strangers and odd lifetimes, creating nothing", async () => {
    const w = world();
    await expect(w.as("u1", true).invoiceLink.create({ invoiceId: "inv1" })).rejects.toThrow(/free account/);
    await expect(w.as(null).invoiceLink.create({ invoiceId: "inv1" })).rejects.toThrow();
    await expect(w.as("u1").invoiceLink.create({ invoiceId: "inv1", expiresInDays: 400 })).rejects.toThrow(
      /30, 90 or 180/,
    );
    expect(LINK_EXPIRY_DAYS).toEqual([30, 90, 180]);
    expect(w.links).toHaveLength(0);
  });

  it("stops at five live links on one invoice, and frees a place when one is turned off", async () => {
    const w = world();
    for (let i = 0; i < MAX_LIVE_LINKS_PER_INVOICE; i++) await w.as("u1").invoiceLink.create({ invoiceId: "inv1" });
    await expect(w.as("u1").invoiceLink.create({ invoiceId: "inv1" })).rejects.toThrow(/already has 5 live/);
    await w.as("u1").invoiceLink.create({ invoiceId: "inv2" }); // another invoice is fine
    await w.as("u1").invoiceLink.revoke({ id: w.links[0].id });
    await w.as("u1").invoiceLink.create({ invoiceId: "inv1" });
    expect(w.links).toHaveLength(MAX_LIVE_LINKS_PER_INVOICE + 2);
  });

  it("stops at the account-wide limit", async () => {
    const w = world();
    const now = nowS();
    for (let i = 0; i < MAX_LIVE_LINKS; i++) {
      w.links.push({
        id: `x${i}`,
        user_id: "u1",
        invoice_id: `other${i % 100}`,
        token_hash: `h${i}`,
        token_prefix: "p",
        expires_at: now + 1000,
        revoked_at: null,
        created_at: new Date(),
      });
    }
    await expect(w.as("u1").invoiceLink.create({ invoiceId: "inv1" })).rejects.toThrow(/200 live/);
  });

  it("lists only your own, and lets you turn off only your own", async () => {
    const w = world();
    const mine = await w.as("u1").invoiceLink.create({ invoiceId: "inv1" });
    await w.as("u2").invoiceLink.create({ invoiceId: "inv3" });
    expect(await w.as("u2").invoiceLink.list({ invoiceId: "inv1" })).toEqual([]); // another account's invoice shows nothing
    expect((await w.as("u1").invoiceLink.list({ invoiceId: "inv1" }))[0].status).toBe("live");
    await expect(w.as("u2").invoiceLink.revoke({ id: mine.id })).rejects.toThrow(/not found/);
    expect(w.links[0].revoked_at).toBeNull();
    await w.as("u1").invoiceLink.revoke({ id: mine.id });
    expect((await w.as("u1").invoiceLink.list({ invoiceId: "inv1" }))[0].status).toBe("revoked");
    await expect(w.as("u1").invoiceLink.revoke({ id: mine.id })).rejects.toThrow(/not found/);
  });
});

describe("rules behind the invoice page", () => {
  it("reads a link's state: turned off wins over expired", () => {
    const base = { revoked_at: null, expires_at: 2000 };
    expect(linkStatus(base, 1000)).toBe("live");
    expect(linkStatus(base, 2000)).toBe("expired");
    expect(linkStatus({ ...base, revoked_at: 5 }, 3000)).toBe("revoked");
  });

  it("finds a link by its token and never by anything shorter or longer", async () => {
    const w = world();
    const { token } = await w.as("u1").invoiceLink.create({ invoiceId: "inv1" });
    expect((await findInvoiceLinkByToken(w.prisma as never, token))?.id).toBe(w.links[0].id);
    expect(await findInvoiceLinkByToken(w.prisma as never, "short")).toBeNull();
    expect(await findInvoiceLinkByToken(w.prisma as never, "y".repeat(43))).toBeNull();
    expect(await findInvoiceLinkByToken(w.prisma as never, "z".repeat(200))).toBeNull();
  });

  it("opens the invoice page to anyone with the link, signed in or not", () => {
    expect(accessDecision("/invoice/abcDEF123", false)).toBe("allow");
    expect(accessDecision("/invoice/abcDEF123", true)).toBe("allow");
    expect(accessDecision("/dashboard/invoices", false)).toBe("to-login");
  });
});
