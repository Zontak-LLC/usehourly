import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { daysBetween, dueReminder, senderBlocker } from "@/lib/invoice-mail";
import { invoiceEmailMessage, senderFrom } from "@/lib/mailer";
import { stopEmailToken, verifyStopEmailToken } from "@/lib/reminder-token";
import { sha256Hex } from "@/lib/sha256";
import { suppressEmails } from "@/server/invoice-mail";
import { runInvoiceReminders } from "@/server/invoice-reminders";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

const prismaMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ getPrisma: prismaMock }));

const createCaller = createCallerFactory(appRouter);
const SECRET = "test-secret-for-signing";
const APP = "https://usehourly.app";
const OLD = new Date("2020-01-01T00:00:00Z");
const VERIFIED = new Date("2020-01-02T00:00:00Z");

type Owner = {
  id: string;
  email: string;
  email_verified_at: Date | null;
  email_bounced_at: Date | null;
  is_demo: boolean;
  created_at: Date;
};
type Inv = {
  id: string;
  user_id: string;
  number: string;
  client_id: string | null;
  due_date: string | null;
  paid_date: string | null;
  total_cents: number;
  snapshot: string;
  remind_overdue: boolean;
  reminders_sent: number;
};

function world() {
  const owners: Record<string, Owner> = {
    u1: {
      id: "u1",
      email: "ada@example.com",
      email_verified_at: VERIFIED,
      email_bounced_at: null,
      is_demo: false,
      created_at: OLD,
    },
    u2: {
      id: "u2",
      email: "bob@example.com",
      email_verified_at: VERIFIED,
      email_bounced_at: null,
      is_demo: false,
      created_at: OLD,
    },
    unverified: {
      id: "unverified",
      email: "n@example.com",
      email_verified_at: null,
      email_bounced_at: null,
      is_demo: false,
      created_at: OLD,
    },
    fresh: {
      id: "fresh",
      email: "f@example.com",
      email_verified_at: VERIFIED,
      email_bounced_at: null,
      is_demo: false,
      created_at: new Date(),
    },
    demo: {
      id: "demo",
      email: "d@demo.invalid",
      email_verified_at: null,
      email_bounced_at: null,
      is_demo: true,
      created_at: OLD,
    },
    bounced: {
      id: "bounced",
      email: "b@example.com",
      email_verified_at: VERIFIED,
      email_bounced_at: new Date(),
      is_demo: false,
      created_at: OLD,
    },
  };
  const snapshot = (name: string) => JSON.stringify({ seller: { name } });
  const inv = (id: string, user_id: string, client_id: string | null, extra: Partial<Inv> = {}): Inv => ({
    id,
    user_id,
    number: `INV-2026-${id}`,
    client_id,
    due_date: "2026-10-10",
    paid_date: null,
    total_cents: 54_000,
    snapshot: snapshot(owners[user_id]?.id === "u1" ? "Ada Makes Sites" : "Someone Else"),
    remind_overdue: false,
    reminders_sent: 0,
    ...extra,
  });
  const invoices: Inv[] = [
    inv("a", "u1", "c1"),
    inv("b", "u1", "c2"), // client without an email address
    inv("c", "u2", "c3"), // another account's invoice
    inv("d", "u1", "c1", { due_date: null }), // no due date
    inv("e", "unverified", "c4"),
    inv("f", "fresh", "c5"),
    inv("g", "demo", "c6"),
    inv("h", "bounced", "c7"),
  ];
  const clients = [
    { id: "c1", user_id: "u1", name: "Acme", email: "AP@Acme.com" },
    { id: "c2", user_id: "u1", name: "NoMail Co", email: null },
    { id: "c3", user_id: "u2", name: "Acme again", email: "ap@acme.com" }, // the same address, another sender
    { id: "c4", user_id: "unverified", name: "X", email: "x@x.co" },
    { id: "c5", user_id: "fresh", name: "X", email: "x2@x.co" },
    { id: "c6", user_id: "demo", name: "X", email: "x3@x.co" },
    { id: "c7", user_id: "bounced", name: "X", email: "x4@x.co" },
  ];
  const suppressed = new Map<string, string>();
  const links: {
    id: string;
    user_id: string;
    invoice_id: string;
    token_hash: string;
    expires_at: number;
    revoked_at: number | null;
  }[] = [];
  const emails: { user_id: string; invoice_id: string; to_email: string; kind: string; created_at: Date }[] = [];
  const limiter = memoryRateLimit();
  let n = 0;
  const sent: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    fromName?: string;
    replyTo?: string;
    headers?: Record<string, string>;
  }[] = [];
  const flags = { mailerOn: true, failing: false };
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const val = row[k];
      if (v && typeof v === "object" && "gt" in v) return (val as number) > (v as { gt: number }).gt;
      if (v && typeof v === "object" && "lt" in v)
        return typeof val === "string" ? val < (v as { lt: string }).lt : false;
      return val === v;
    });
  const prisma = {
    rateLimit: limiter.rateLimit,
    authUser: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => owners[where.id] ?? null) },
    invoice: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; user_id: string } }) =>
          invoices.find((i) => i.id === where.id && i.user_id === where.user_id) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        invoices.filter((i) => {
          const w = where as {
            remind_overdue: boolean;
            paid_date: null;
            due_date: { lt: string };
            reminders_sent: { lt: number };
          };
          return (
            i.remind_overdue === w.remind_overdue &&
            i.paid_date === w.paid_date &&
            i.due_date !== null &&
            i.due_date < w.due_date.lt &&
            i.reminders_sent < w.reminders_sent.lt
          );
        }),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Inv> }) => {
        const hit = invoices.filter((i) => matches(i as unknown as Record<string, unknown>, where));
        for (const i of hit) Object.assign(i, data);
        return { count: hit.length };
      }),
    },
    client: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; user_id: string } }) =>
          clients.find((c) => c.id === where.id && c.user_id === where.user_id) ?? null,
      ),
    },
    emailSuppression: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        suppressed.has(where.email) ? { email: where.email } : null,
      ),
      upsert: vi.fn(
        async ({ where, create }: { where: { email: string }; create: { email: string; reason: string } }) => {
          if (!suppressed.has(where.email)) suppressed.set(where.email, create.reason);
        },
      ),
    },
    invoiceLink: {
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) => links.filter((l) => matches(l as never, where)).length,
      ),
      create: vi.fn(
        async ({ data }: { data: { user_id: string; invoice_id: string; token_hash: string; expires_at: number } }) => {
          const row = { id: `l${++n}`, revoked_at: null, ...data };
          links.push(row);
          return { id: row.id };
        },
      ),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: { revoked_at: number } }) => {
        const hit = links.filter((l) => l.id === where.id);
        for (const l of hit) l.revoked_at = data.revoked_at;
        return { count: hit.length };
      }),
    },
    invoiceEmail: {
      create: vi.fn(async ({ data }: { data: (typeof emails)[number] }) => {
        emails.push({ ...data, created_at: new Date() });
      }),
      findMany: vi.fn(async ({ where }: { where: { user_id: string; invoice_id: string } }) =>
        emails.filter((e) => e.user_id === where.user_id && e.invoice_id === where.invoice_id).reverse(),
      ),
    },
  };
  const mailer = () =>
    flags.mailerOn
      ? {
          send: async (m: (typeof sent)[number]) => {
            if (flags.failing) throw new Error("raw provider error: key re_secret123 rejected");
            sent.push(m);
          },
        }
      : null;
  const as = (id: string | null) =>
    createCaller({
      session: id ? ({ user: { id }, expires: "" } as never) : null,
      prisma: prisma as never,
      mailer: mailer(),
      baseUrl: APP,
    } as never);
  return { owners, invoices, clients, suppressed, links, emails, sent, flags, limiter, prisma, mailer, as };
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("who may email invoices", () => {
  const ok = { email_verified_at: VERIFIED, email_bounced_at: null, is_demo: false, created_at: OLD };
  it("needs a confirmed, working address on an account at least a day old", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    expect(senderBlocker(ok, now)).toBeNull();
    expect(senderBlocker({ ...ok, is_demo: true }, now)).toMatch(/free account/);
    expect(senderBlocker({ ...ok, email_verified_at: null }, now)).toMatch(/Confirm your own email/);
    expect(senderBlocker({ ...ok, email_bounced_at: new Date() }, now)).toMatch(/bounced/);
    expect(senderBlocker({ ...ok, created_at: new Date("2026-10-17T00:00:01Z") }, now)).toMatch(/first day/);
    expect(senderBlocker({ ...ok, created_at: new Date("2026-10-16T12:00:00Z") }, now)).toBeNull(); // exactly 24 hours
  });
});

describe("when an overdue reminder is due", () => {
  const inv = { due_date: "2026-10-10", paid_date: null as string | null, reminders_sent: 0 };
  it("goes a day after the due date, again after a week, then never more", () => {
    expect(dueReminder(inv, "2026-10-10")).toBeNull(); // due today is not late
    expect(dueReminder(inv, "2026-10-11")).toBe(0);
    expect(dueReminder({ ...inv, reminders_sent: 1 }, "2026-10-16")).toBeNull();
    expect(dueReminder({ ...inv, reminders_sent: 1 }, "2026-10-17")).toBe(1);
    expect(dueReminder({ ...inv, reminders_sent: 2 }, "2027-01-01")).toBeNull();
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
  it("never for a paid invoice or one with no due date", () => {
    expect(dueReminder({ ...inv, paid_date: "2026-10-12" }, "2026-10-20")).toBeNull();
    expect(dueReminder({ ...inv, due_date: null }, "2026-10-20")).toBeNull();
  });
});

describe("the message a client gets", () => {
  const base = {
    kind: "invoice" as const,
    sellerName: "Ada Makes Sites",
    sellerEmail: "ada@example.com",
    number: "INV-2026-001",
    totalLabel: "$540.00",
    dueLabel: "Nov 13, 2026",
    note: null as string | null,
    link: `${APP}/invoice/tok`,
    stopUrl: `${APP}/stop-emails?e=a&t=b`,
    oneClickUrl: `${APP}/api/stop-emails?e=a&t=b`,
  };
  it("comes from the freelancer via UseHourly, replies go to them, and the stop link is in both parts and the headers", () => {
    const m = invoiceEmailMessage("ap@acme.com", base);
    expect(m.subject).toBe("Invoice INV-2026-001 from Ada Makes Sites");
    expect(m.fromName).toBe("Ada Makes Sites via UseHourly");
    expect(m.replyTo).toBe("ada@example.com");
    expect(m.text).toContain("INV-2026-001 · $540.00 · due Nov 13, 2026");
    expect(m.text).toContain(`${APP}/invoice/tok`);
    expect(m.text).toContain(`Stop these emails: ${base.stopUrl}`);
    expect(m.html).toContain('href="https://usehourly.app/stop-emails?e=a&amp;t=b"');
    expect(m.headers).toEqual({
      "List-Unsubscribe": `<${base.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
  it("quotes the freelancer's words under a fixed lead, escaped, so they cannot pass as UseHourly", () => {
    const m = invoiceEmailMessage("ap@acme.com", {
      ...base,
      note: `<script>alert(1)</script> Pay now to UseHourly Support`,
    });
    expect(m.text).toContain("A note from Ada Makes Sites:");
    expect(m.html).not.toContain("<script");
    expect(m.html).toContain("&lt;script&gt;");
  });
  it("cleans a hostile business name out of the subject and sender name", () => {
    const m = invoiceEmailMessage("ap@acme.com", { ...base, sellerName: 'Evil"\r\nBcc: x@y.co <b>' });
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.fromName).not.toMatch(/[\r\n]/);
  });
  it("words a reminder as a reminder and offers a way out if they already paid", () => {
    const m = invoiceEmailMessage("ap@acme.com", { ...base, kind: "reminder" });
    expect(m.subject).toBe("Reminder: invoice INV-2026-001 from Ada Makes Sites");
    expect(m.text).toContain("past its due date");
    expect(m.text).toContain("If you have already paid");
  });
  it("builds a From line from the app's own address, never from the name", () => {
    expect(senderFrom("UseHourly <hi@usehourly.app>", "Ada via UseHourly")).toBe(
      '"Ada via UseHourly" <hi@usehourly.app>',
    );
    expect(senderFrom("hi@usehourly.app", "Ada")).toBe('"Ada" <hi@usehourly.app>');
    expect(senderFrom("UseHourly <hi@usehourly.app>", 'x" <evil@bad.co>')).toBe('"x evil@bad.co" <hi@usehourly.app>');
    expect(senderFrom("UseHourly <hi@usehourly.app>")).toBe("UseHourly <hi@usehourly.app>");
    expect(senderFrom("UseHourly <hi@usehourly.app>", '"<>\r\n')).toBe("UseHourly <hi@usehourly.app>");
  });
});

describe("emailing an invoice", () => {
  it("sends one message to the client's address with a fresh private link, and records it", async () => {
    const w = world();
    const out = await w.as("u1").invoiceMail.send({ invoiceId: "a", note: "Thanks for a great month" });
    expect(out.to).toBe("ap@acme.com"); // the address is normalised
    expect(w.sent).toHaveLength(1);
    const m = w.sent[0];
    expect(m.to).toBe("ap@acme.com");
    expect(m.replyTo).toBe("ada@example.com");
    expect(m.fromName).toBe("Ada Makes Sites via UseHourly");
    expect(m.text).toContain("Thanks for a great month");
    const link = /https:\/\/usehourly\.app\/invoice\/(\S+)/.exec(m.text)?.[1] as string;
    expect(link.length).toBeGreaterThan(30);
    expect(w.links).toHaveLength(1);
    expect(w.links[0].token_hash).not.toBe(link); // only a hash is stored
    expect(JSON.stringify(w.links)).not.toContain(link);
    expect(w.emails).toEqual([
      expect.objectContaining({ user_id: "u1", invoice_id: "a", to_email: "ap@acme.com", kind: "invoice" }),
    ]);
    const info = await w.as("u1").invoiceMail.recipient({ invoiceId: "a" });
    expect(info.history).toHaveLength(1);
    expect(info.blocked).toBeNull();
  });

  it("refuses accounts that are unconfirmed, brand new, sample or bounced, sending and creating nothing", async () => {
    for (const [id, invoiceId] of [
      ["unverified", "e"],
      ["fresh", "f"],
      ["demo", "g"],
      ["bounced", "h"],
    ] as const) {
      const w = world();
      await expect(w.as(id).invoiceMail.send({ invoiceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(w.sent, id).toHaveLength(0);
      expect(w.links, id).toHaveLength(0);
      expect(w.emails, id).toHaveLength(0);
    }
  });

  it("does nothing when email isn't set up, and tells the panel why", async () => {
    const w = world();
    w.flags.mailerOn = false;
    await expect(w.as("u1").invoiceMail.send({ invoiceId: "a" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect((await w.as("u1").invoiceMail.recipient({ invoiceId: "a" })).blocked).toMatch(/isn't set up/);
    expect(w.links).toHaveLength(0);
  });

  it("asks for a client address when there is none", async () => {
    const w = world();
    await expect(w.as("u1").invoiceMail.send({ invoiceId: "b" })).rejects.toThrow(/Add an email address for NoMail Co/);
    expect(w.sent).toHaveLength(0);
    expect(w.links).toHaveLength(0);
  });

  it("never emails an address that asked to stop or bounced, whoever is sending", async () => {
    const w = world();
    await suppressEmails(w.prisma as never, ["  AP@acme.COM "], "asked-to-stop");
    await expect(w.as("u1").invoiceMail.send({ invoiceId: "a" })).rejects.toThrow(/asked not to get emails/);
    await expect(w.as("u2").invoiceMail.send({ invoiceId: "c" })).rejects.toThrow(/asked not to get emails/);
    expect(w.sent).toHaveLength(0);
    expect(w.links).toHaveLength(0);
    await suppressEmails(w.prisma as never, ["ap@acme.com"], "bounced"); // asking twice changes nothing
    expect(w.suppressed.get("ap@acme.com")).toBe("asked-to-stop");
  });

  it("will not send another account's invoice", async () => {
    const w = world();
    await expect(w.as("u1").invoiceMail.send({ invoiceId: "c" })).rejects.toThrow(/not found/i);
    expect(w.sent).toHaveLength(0);
  });

  it("limits one address to three emails a day across every sender", async () => {
    const w = world();
    for (let i = 0; i < 2; i++) await w.as("u1").invoiceMail.send({ invoiceId: "a" });
    await w.as("u2").invoiceMail.send({ invoiceId: "c" }); // the same address, a different sender: the third
    await expect(w.as("u1").invoiceMail.send({ invoiceId: "a" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(w.sent).toHaveLength(3);
  });

  it("limits an account to 20 a day", async () => {
    const w = world();
    w.limiter.rows.set("invmail:u:u1", {
      key: "invmail:u:u1",
      count: 20,
      reset_at: Math.floor(Date.now() / 1000) + 3600,
    });
    await expect(w.as("u1").invoiceMail.send({ invoiceId: "a" })).rejects.toThrow(/20 invoices today/);
    expect(w.sent).toHaveLength(0);
    expect(w.links).toHaveLength(0);
  });

  it("turns the link back off and shows no raw error when the email service fails", async () => {
    const w = world();
    w.flags.failing = true;
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const err = await w
      .as("u1")
      .invoiceMail.send({ invoiceId: "a" })
      .catch((e) => e);
    quiet.mockRestore();
    expect(err.message).toBe("Couldn't send the email right now. Please try again in a minute.");
    expect(err.message).not.toContain("re_secret123");
    expect(w.links).toHaveLength(1);
    expect(w.links[0].revoked_at).not.toBeNull();
    expect(w.emails).toHaveLength(0);
  });

  it("turns reminders on only for an invoice with a due date, and refuses before sending anything", async () => {
    const w = world();
    await expect(w.as("u1").invoiceMail.send({ invoiceId: "d", remindOverdue: true })).rejects.toThrow(/due date/);
    expect(w.sent).toHaveLength(0);
    await w.as("u1").invoiceMail.send({ invoiceId: "a", remindOverdue: true });
    expect(w.invoices.find((i) => i.id === "a")?.remind_overdue).toBe(true);
    await expect(w.as("u1").invoiceMail.setReminders({ invoiceId: "d", enabled: true })).rejects.toThrow(/due date/);
    await expect(w.as("u2").invoiceMail.setReminders({ invoiceId: "a", enabled: false })).rejects.toThrow(/not found/i);
    expect(w.invoices.find((i) => i.id === "a")?.remind_overdue).toBe(true);
    await w.as("u1").invoiceMail.setReminders({ invoiceId: "a", enabled: false });
    expect(w.invoices.find((i) => i.id === "a")?.remind_overdue).toBe(false);
  });

  it("rejects a note over 1,000 characters and strangers", async () => {
    const w = world();
    await expect(w.as("u1").invoiceMail.send({ invoiceId: "a", note: "n".repeat(1001) })).rejects.toThrow();
    await expect(w.as(null).invoiceMail.send({ invoiceId: "a" })).rejects.toThrow();
    expect(w.sent).toHaveLength(0);
  });
});

describe("overdue reminders", () => {
  const run = (w: ReturnType<typeof world>, today: string) =>
    runInvoiceReminders({
      prisma: w.prisma as never,
      mailer: w.mailer(),
      appUrl: APP,
      secret: SECRET,
      now: new Date(`${today}T12:00:00Z`),
    });
  const optIn = (w: ReturnType<typeof world>, extra: Partial<Inv> = {}) => {
    Object.assign(w.invoices.find((i) => i.id === "a") as Inv, { remind_overdue: true, ...extra });
  };

  it("sends the first a day late and the second a week late, and then stops", async () => {
    const w = world();
    optIn(w);
    expect(await run(w, "2026-10-10")).toMatchObject({ sent: 0 }); // due today
    expect(await run(w, "2026-10-11")).toMatchObject({ sent: 1 });
    expect(await run(w, "2026-10-12")).toMatchObject({ sent: 0 }); // not twice in a row
    expect(await run(w, "2026-10-17")).toMatchObject({ sent: 1 });
    expect(await run(w, "2026-11-30")).toMatchObject({ sent: 0 }); // two is the most
    expect(w.sent.map((m) => m.subject)).toEqual([
      "Reminder: invoice INV-2026-a from Ada Makes Sites",
      "Reminder: invoice INV-2026-a from Ada Makes Sites",
    ]);
    expect(w.emails.map((e) => e.kind)).toEqual(["reminder", "reminder"]);
    expect(w.links).toHaveLength(2); // each reminder carries its own fresh link
  });

  it("never reminds about a paid invoice, an invoice that did not opt in, or one with no due date", async () => {
    const w = world();
    optIn(w, { paid_date: "2026-10-12" });
    Object.assign(w.invoices.find((i) => i.id === "d") as Inv, { remind_overdue: true });
    expect(await run(w, "2026-10-20")).toMatchObject({ considered: 0, sent: 0 });
    optIn(w, { paid_date: null, remind_overdue: false });
    expect(await run(w, "2026-10-20")).toMatchObject({ sent: 0 });
    expect(w.sent).toHaveLength(0);
  });

  it("lets only one of two overlapping runs send a given reminder", async () => {
    const w = world();
    optIn(w);
    // both runs read the list before either claims, so only the conditional claim can stop the second
    const realFind = w.prisma.invoice.findMany.getMockImplementation() as (a: never) => Promise<Inv[]>;
    let arrived = 0;
    let release: () => void = () => undefined;
    const both = new Promise<void>((r) => {
      release = r;
    });
    w.prisma.invoice.findMany.mockImplementation((async (a: never) => {
      const rows = (await realFind(a)).map((r) => ({ ...r }));
      if (++arrived === 2) release();
      await both;
      return rows;
    }) as never);
    const [x, y] = await Promise.all([run(w, "2026-10-11"), run(w, "2026-10-11")]);
    expect(x.sent + y.sent).toBe(1);
    expect(w.sent).toHaveLength(1);
  });

  it("gives the claim back when the email service fails, so the next hour tries again", async () => {
    const w = world();
    optIn(w);
    w.flags.failing = true;
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await run(w, "2026-10-11")).toMatchObject({ sent: 0, retry: 1 });
    quiet.mockRestore();
    expect(w.invoices.find((i) => i.id === "a")?.reminders_sent).toBe(0);
    w.flags.failing = false;
    expect(await run(w, "2026-10-11")).toMatchObject({ sent: 1 });
    expect(w.invoices.find((i) => i.id === "a")?.reminders_sent).toBe(1);
  });

  it("retries after a daily limit, but gives up on a client who opted out", async () => {
    const w = world();
    optIn(w);
    w.limiter.rows.set(`invmail:r:${await sha256Hex("ap@acme.com")}`, {
      key: `invmail:r:${await sha256Hex("ap@acme.com")}`,
      count: 3,
      reset_at: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(await run(w, "2026-10-11")).toMatchObject({ sent: 0, retry: 1 });
    expect(w.invoices.find((i) => i.id === "a")?.reminders_sent).toBe(0);
    w.limiter.rows.clear();
    await suppressEmails(w.prisma as never, ["ap@acme.com"], "asked-to-stop");
    expect(await run(w, "2026-10-11")).toMatchObject({ sent: 0, skipped: 1, retry: 0 });
    expect(w.invoices.find((i) => i.id === "a")?.reminders_sent).toBe(1); // used up, not retried every hour
    expect(w.sent).toHaveLength(0);
  });

  it("does nothing at all when email isn't set up", async () => {
    const w = world();
    optIn(w);
    w.flags.mailerOn = false;
    expect(await run(w, "2026-10-20")).toEqual({ considered: 0, sent: 0, skipped: 0, retry: 0 });
    expect(w.invoices.find((i) => i.id === "a")?.reminders_sent).toBe(0);
  });
});

describe("the stop link", () => {
  it("is signed per address and ignores case", async () => {
    const t = await stopEmailToken(SECRET, "Ap@Acme.com");
    expect(await verifyStopEmailToken(SECRET, "ap@acme.com", t)).toBe(true);
    expect(await verifyStopEmailToken(SECRET, "someone@else.com", t)).toBe(false);
    expect(await verifyStopEmailToken(SECRET, "ap@acme.com", `${t}x`)).toBe(false);
    expect(await verifyStopEmailToken("other-secret", "ap@acme.com", t)).toBe(false);
    expect(await verifyStopEmailToken(SECRET, "", t)).toBe(false);
  });

  it("stops an address only on POST with a valid signature", async () => {
    const w = world();
    prismaMock.mockResolvedValue(w.prisma);
    const { POST, GET } = await import("@/app/api/stop-emails/route");
    const t = await stopEmailToken(SECRET, "ap@acme.com");
    const url = (e: string, tok: string) =>
      `${APP}/api/stop-emails?e=${encodeURIComponent(e)}&t=${encodeURIComponent(tok)}`;
    expect((await POST(new Request(url("ap@acme.com", "nope"), { method: "POST" }))).status).toBe(400);
    expect((await POST(new Request(url("other@acme.com", t), { method: "POST" }))).status).toBe(400); // a token for a different address
    expect(w.suppressed.size).toBe(0);
    expect(GET().status).toBe(405); // a mail scanner opening the link changes nothing
    expect(w.suppressed.size).toBe(0);
    const ok = await POST(new Request(url("ap@acme.com", t), { method: "POST" }));
    expect(ok.status).toBe(200);
    expect(w.suppressed.get("ap@acme.com")).toBe("asked-to-stop");
    // and from then on nothing is sent to it
    await expect(w.as("u1").invoiceMail.send({ invoiceId: "a" })).rejects.toThrow(/asked not to get emails/);
  });
});
