import { hash } from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addressesToSuppress, svixSign, verifySvix } from "@/lib/resend-webhook";
import { NO_PASSWORD_HASH } from "@/lib/social-login";
import { verifyTurnstile } from "@/lib/turnstile";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

const createCaller = createCallerFactory(appRouter);

type Row = Record<string, unknown> & { id?: string; user_id?: string };

/** Two people's data in every table an account owns. Deleting one must leave the other whole. */
async function world() {
  const tables: Record<string, Row[]> = {
    authUser: [
      { id: "u1", email: "ada@example.com", password_hash: await hash("correct horse", 4) },
      { id: "u2", email: "bob@example.com", password_hash: await hash("battery staple", 4) },
      { id: "u3", email: "gil@example.com", password_hash: NO_PASSWORD_HASH },
    ],
    client: [{ user_id: "u1" }, { user_id: "u2" }],
    project: [{ user_id: "u1" }, { user_id: "u2" }],
    timeEntry: [{ user_id: "u1" }, { user_id: "u1" }, { user_id: "u2" }],
    invoice: [{ user_id: "u1" }, { user_id: "u2" }],
    invoiceLogo: [{ user_id: "u1" }, { user_id: "u2" }],
    emailToken: [{ user_id: "u1" }],
    apiToken: [{ user_id: "u1" }, { user_id: "u2" }],
    oauthCode: [{ user_id: "u1" }],
    timesheetShare: [{ user_id: "u1" }, { user_id: "u2" }],
    invoiceLink: [{ user_id: "u1" }, { user_id: "u2" }],
    invoiceEmail: [{ user_id: "u1" }, { user_id: "u2" }],
  };
  const limiter = memoryRateLimit();
  const model = (name: string) => ({
    deleteMany: vi.fn(async ({ where }: { where: { user_id: string } }) => {
      const before = tables[name].length;
      tables[name] = tables[name].filter((r) => r.user_id !== where.user_id);
      return { count: before - tables[name].length };
    }),
  });
  const prisma = {
    rateLimit: limiter.rateLimit,
    client: model("client"),
    project: model("project"),
    timeEntry: model("timeEntry"),
    invoice: model("invoice"),
    invoiceLogo: model("invoiceLogo"),
    emailToken: model("emailToken"),
    apiToken: model("apiToken"),
    oauthCode: model("oauthCode"),
    timesheetShare: model("timesheetShare"),
    invoiceLink: model("invoiceLink"),
    invoiceEmail: model("invoiceEmail"),
    authUser: {
      findUnique: vi.fn(
        async ({ where }: { where: { id?: string; email?: string } }) =>
          tables.authUser.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        tables.authUser = tables.authUser.filter((u) => u.id !== where.id);
      }),
    },
  };
  const as = (id: string, demo = false) =>
    createCaller({
      session: { user: { id, ...(demo ? { demo: true } : {}) }, expires: "" } as never,
      prisma: prisma as never,
    });
  const count = (table: string, user: string) => tables[table].filter((r) => (r.user_id ?? r.id) === user).length;
  return { tables, prisma, as, count };
}

describe("deleting your own account", () => {
  it("removes every row the account owns and nothing of anyone else's", async () => {
    const w = await world();
    expect(await w.as("u1").account.deleteAccount({ confirm: "correct horse" })).toEqual({ deleted: true });
    for (const t of [
      "authUser",
      "client",
      "project",
      "timeEntry",
      "invoice",
      "invoiceLogo",
      "emailToken",
      "apiToken",
      "oauthCode",
      "timesheetShare",
      "invoiceLink",
      "invoiceEmail",
    ]) {
      expect(w.count(t, "u1"), t).toBe(0);
    }
    expect(w.count("timeEntry", "u2")).toBe(1);
    expect(w.count("invoice", "u2")).toBe(1);
    expect(w.count("apiToken", "u2")).toBe(1);
    expect(w.count("authUser", "u2")).toBe(1);
  });

  it("deletes the account last, so a failure half way can be retried", async () => {
    const w = await world();
    w.prisma.invoice.deleteMany.mockRejectedValueOnce(new Error("database hiccup"));
    await expect(w.as("u1").account.deleteAccount({ confirm: "correct horse" })).rejects.toThrow();
    expect(w.count("authUser", "u1")).toBe(1); // still there, so signing in and trying again works
    await w.as("u1").account.deleteAccount({ confirm: "correct horse" });
    expect(w.count("authUser", "u1")).toBe(0);
  });

  it("refuses a wrong password and deletes nothing", async () => {
    const w = await world();
    await expect(w.as("u1").account.deleteAccount({ confirm: "nope nope" })).rejects.toThrow("Password is incorrect.");
    expect(w.prisma.authUser.delete).not.toHaveBeenCalled();
    expect(w.count("timeEntry", "u1")).toBe(2);
  });

  it("stops guessing after five wrong tries, even if the sixth is right", async () => {
    const w = await world();
    for (let i = 0; i < 5; i++)
      await expect(w.as("u1").account.deleteAccount({ confirm: `guess ${i}` })).rejects.toThrow();
    await expect(w.as("u1").account.deleteAccount({ confirm: "correct horse" })).rejects.toThrow(/Too many tries/);
    expect(w.count("authUser", "u1")).toBe(1);
  });

  it("asks a GitHub or Google account for its email address instead of a password", async () => {
    const w = await world();
    await expect(w.as("u3").account.deleteAccount({ confirm: "someone@else.com" })).rejects.toThrow(
      "That isn't your email address.",
    );
    expect(w.count("authUser", "u3")).toBe(1);
    await w.as("u3").account.deleteAccount({ confirm: " GIL@example.com " });
    expect(w.count("authUser", "u3")).toBe(0);
  });

  it("does not delete sample accounts (they clear themselves) or anonymous callers", async () => {
    const w = await world();
    await expect(w.as("u1", true).account.deleteAccount({ confirm: "correct horse" })).rejects.toThrow(
      /Sample accounts/,
    );
    await expect(
      createCaller({ session: null, prisma: w.prisma as never }).account.deleteAccount({ confirm: "x" }),
    ).rejects.toThrow();
    expect(w.count("authUser", "u1")).toBe(1);
    expect(w.prisma.authUser.delete).not.toHaveBeenCalled();
  });

  it("rejects an empty confirmation before touching the database", async () => {
    const w = await world();
    await expect(w.as("u1").account.deleteAccount({ confirm: "" })).rejects.toThrow();
    expect(w.prisma.authUser.findUnique).not.toHaveBeenCalled();
  });
});

describe("sign-up robot checks", () => {
  const prismaFor = () => {
    const users: Row[] = [];
    return {
      users,
      prisma: {
        rateLimit: memoryRateLimit().rateLimit,
        authUser: {
          findUnique: vi.fn(async () => null),
          create: vi.fn(async ({ data }: { data: Row }) => {
            users.push(data);
            return { id: "new", ...data };
          }),
        },
        emailToken: { deleteMany: vi.fn(), create: vi.fn() },
      },
    };
  };
  const anon = (db: ReturnType<typeof prismaFor>) =>
    createCaller({ session: null, prisma: db.prisma as never, ip: "1.2.3.4" } as never);
  const person = { name: "Ada", email: "ada@example.com", password: "long enough" };

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("turns away a sign-up that filled the hidden box, creating nothing", async () => {
    const db = prismaFor();
    await expect(anon(db).account.register({ ...person, website: "http://spam.example" })).rejects.toThrow();
    expect(db.prisma.authUser.create).not.toHaveBeenCalled();
  });

  it("works as before when the robot check is not set up", async () => {
    const db = prismaFor();
    await anon(db).account.register({ ...person, website: "" });
    expect(db.users).toHaveLength(1);
    expect((await anon(db).account.signupCheck()).siteKey).toBeNull();
  });

  describe("with Turnstile set up", () => {
    beforeEach(() => {
      vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
      vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key");
    });

    it("shows the public key but never the secret", async () => {
      expect(await anon(prismaFor()).account.signupCheck()).toEqual({ siteKey: "site-key" });
    });

    it("refuses a sign-up with no token or a rejected one, creating nothing", async () => {
      const db = prismaFor();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ success: false })),
      );
      await expect(anon(db).account.register(person)).rejects.toThrow(/not a robot/);
      await expect(anon(db).account.register({ ...person, captcha: "bad" })).rejects.toThrow(/not a robot/);
      expect(db.prisma.authUser.create).not.toHaveBeenCalled();
    });

    it("lets a verified sign-up through, sending Cloudflare the secret, the token and the address", async () => {
      const db = prismaFor();
      const fetchMock = vi.fn(async () => Response.json({ success: true }));
      vi.stubGlobal("fetch", fetchMock);
      await anon(db).account.register({ ...person, captcha: "good-token" });
      expect(db.users).toHaveLength(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }];
      expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
      expect(Object.fromEntries(init.body)).toEqual({
        secret: "secret-key",
        response: "good-token",
        remoteip: "1.2.3.4",
      });
    });

    it("treats a Cloudflare outage as a no, not as a free pass", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("network");
        }),
      );
      expect(await verifyTurnstile("token", "1.2.3.4")).toBe(false);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("oops", { status: 500 })),
      );
      expect(await verifyTurnstile("token", "1.2.3.4")).toBe(false);
    });
  });
});

describe("email bounces", () => {
  const secret = `whsec_${btoa("super-secret-key")}`;
  const body = JSON.stringify({
    type: "email.bounced",
    data: { to: ["Dead@Example.com"], bounce: { type: "Permanent" } },
  });

  it("accepts a correctly signed event and rejects a forged, stale or unsigned one", async () => {
    const now = 1_800_000_000;
    const good = `v1,${await svixSign(secret, "msg_1", String(now), body)}`;
    const base = { secret, id: "msg_1", timestamp: String(now), body, nowSeconds: now };
    expect(await verifySvix({ ...base, signature: good })).toBe(true);
    expect(await verifySvix({ ...base, signature: `v1,AAAA ${good}` })).toBe(true); // key rotation sends several
    expect(await verifySvix({ ...base, signature: "v1,AAAA" })).toBe(false);
    expect(await verifySvix({ ...base, signature: good, body: body.replace("Dead", "Live") })).toBe(false);
    expect(await verifySvix({ ...base, signature: good, nowSeconds: now + 3600 })).toBe(false); // replay
    expect(await verifySvix({ ...base, signature: null })).toBe(false);
    expect(await verifySvix({ ...base, id: null, signature: good })).toBe(false);
  });

  it("stops mail only for permanent bounces and spam complaints", () => {
    expect(addressesToSuppress(JSON.parse(body))).toEqual(["dead@example.com"]);
    expect(addressesToSuppress({ type: "email.complained", data: { to: ["a@b.co"] } })).toEqual(["a@b.co"]);
    expect(
      addressesToSuppress({ type: "email.bounced", data: { to: ["a@b.co"], bounce: { type: "Transient" } } }),
    ).toEqual([]);
    expect(addressesToSuppress({ type: "email.delivered", data: { to: ["a@b.co"] } })).toEqual([]);
    expect(addressesToSuppress("nonsense")).toEqual([]);
    expect(addressesToSuppress(null)).toEqual([]);
  });
});
