import { compare } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import type { Mailer, MailMessage } from "@/lib/mailer";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

type User = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  token_version: number;
  email_verified_at: Date | null;
};
type Token = {
  id: string;
  user_id: string;
  kind: string;
  token_hash: string;
  expires_at: number;
  used_at: number | null;
};

/** A small in-memory database with just the tables these flows touch. */
function world(initial: User[] = []) {
  const users = new Map(initial.map((u) => [u.id, u]));
  const tokens = new Map<string, Token>();
  let n = 0;
  const prisma = {
    authUser: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return users.get(where.id) ?? null;
        return [...users.values()].find((u) => u.email === where.email) ?? null;
      }),
      create: vi.fn(
        async ({ data }: { data: Partial<User> & { email: string; name: string; password_hash: string } }) => {
          const u: User = { id: `u${++n}`, token_version: 0, email_verified_at: null, ...data };
          users.set(u.id, u);
          return u;
        },
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = users.get(where.id);
        if (!u) throw new Error("no such user");
        const next = { ...u } as Record<string, unknown>;
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === "object" && "increment" in (v as object)) {
            next[k] = Number((u as unknown as Record<string, unknown>)[k]) + (v as { increment: number }).increment;
          } else next[k] = v;
        }
        users.set(u.id, next as User);
        return next;
      }),
    },
    emailToken: {
      create: vi.fn(async ({ data }: { data: Omit<Token, "id" | "used_at"> }) => {
        const t: Token = { id: `t${++n}`, used_at: null, ...data };
        tokens.set(t.id, t);
        return t;
      }),
      findUnique: vi.fn(async ({ where }: { where: { token_hash: string } }) => {
        return [...tokens.values()].find((t) => t.token_hash === where.token_hash) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Token> }) => {
        const t = tokens.get(where.id);
        if (t) tokens.set(t.id, { ...t, ...data });
      }),
      deleteMany: vi.fn(async ({ where }: { where: { user_id: string; kind: string; used_at: null } }) => {
        for (const t of [...tokens.values()]) {
          if (t.user_id === where.user_id && t.kind === where.kind && t.used_at === null) tokens.delete(t.id);
        }
      }),
    },
    rateLimit: memoryRateLimit().rateLimit,
  };
  const outbox: MailMessage[] = [];
  const mailer: Mailer = { send: async (m) => void outbox.push(m) };
  const caller = (opts: { userId?: string; mailer?: Mailer | null; ip?: string } = {}) =>
    createCallerFactory(appRouter)({
      session: opts.userId ? { user: { id: opts.userId }, expires: "" } : null,
      prisma: prisma as never,
      mailer: opts.mailer === undefined ? mailer : opts.mailer,
      baseUrl: "https://app.example.com",
      ip: opts.ip ?? null,
    });
  return { users, tokens, prisma, outbox, caller };
}

const tokenIn = (m: MailMessage) => decodeURIComponent(/token=([^\s&]+)/.exec(m.text)?.[1] ?? "");

async function user(id = "u0", over: Partial<User> = {}): Promise<User> {
  const { hash } = await import("bcryptjs");
  return {
    id,
    email: "jo@example.com",
    name: "Jo",
    password_hash: await hash("old-password", 4),
    token_version: 0,
    email_verified_at: null,
    ...over,
  };
}

describe("confirming an email address", () => {
  it("register emails a link; opening it confirms the address, once", async () => {
    const w = world();
    const { id } = await w
      .caller()
      .account.register({ name: "Jo", email: "Jo@Example.com", password: "long-enough-pw" });
    expect(w.outbox).toHaveLength(1);
    expect(w.outbox[0].to).toBe("jo@example.com");
    expect(w.outbox[0].text).toContain("https://app.example.com/verify-email?token=");
    // only a hash of the token is stored
    const token = tokenIn(w.outbox[0]);
    expect([...w.tokens.values()].every((t) => t.token_hash !== token)).toBe(true);

    await w.caller().account.verifyEmail({ token });
    expect(w.users.get(id)?.email_verified_at).toBeInstanceOf(Date);

    await expect(w.caller().account.verifyEmail({ token })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("still creates the account when no email service is set up", async () => {
    const w = world();
    const out = await w.caller({ mailer: null }).account.register({
      name: "Jo",
      email: "jo@example.com",
      password: "long-enough-pw",
    });
    expect(out.id).toBeTruthy();
    expect(w.outbox).toHaveLength(0);
    expect(w.tokens.size).toBe(0);
  });

  it("says plainly that email is not set up when asked to send another", async () => {
    const w = world([await user("u1")]);
    await expect(w.caller({ userId: "u1", mailer: null }).account.sendVerification()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("limits how often a confirmation email can be requested", async () => {
    const w = world([await user("u1")]);
    const c = w.caller({ userId: "u1" });
    for (let i = 0; i < 3; i++) await c.account.sendVerification();
    await expect(c.account.sendVerification()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(w.outbox).toHaveLength(3);
  });
});

describe("resetting a forgotten password", () => {
  it("emails a link, accepts a new password once, signs every device out and confirms the address", async () => {
    const w = world([await user("u1")]);
    await w.caller().account.requestPasswordReset({ email: "JO@example.com" });
    expect(w.outbox).toHaveLength(1);
    const token = tokenIn(w.outbox[0]);

    await w.caller().account.resetPassword({ token, newPassword: "a-brand-new-password" });
    const after = w.users.get("u1");
    expect(await compare("a-brand-new-password", after?.password_hash ?? "")).toBe(true);
    expect(await compare("old-password", after?.password_hash ?? "")).toBe(false);
    expect(after?.token_version).toBe(1); // every older session is dead
    expect(after?.email_verified_at).toBeInstanceOf(Date);

    await expect(
      w.caller().account.resetPassword({ token, newPassword: "yet-another-password" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await compare("a-brand-new-password", w.users.get("u1")?.password_hash ?? "")).toBe(true);
  });

  it("answers the same for an unknown address and sends nothing", async () => {
    const w = world([await user("u1")]);
    await expect(w.caller().account.requestPasswordReset({ email: "nobody@example.com" })).resolves.toEqual({
      ok: true,
    });
    expect(w.outbox).toHaveLength(0);
  });

  it("a newer link replaces the older one", async () => {
    const w = world([await user("u1")]);
    await w.caller().account.requestPasswordReset({ email: "jo@example.com" });
    await w.caller().account.requestPasswordReset({ email: "jo@example.com" });
    const [first, second] = w.outbox.map(tokenIn);
    await expect(
      w.caller().account.resetPassword({ token: first, newPassword: "a-brand-new-password" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      w.caller().account.resetPassword({ token: second, newPassword: "a-brand-new-password" }),
    ).resolves.toEqual({ ok: true });
  });

  it("refuses an expired link and changes nothing", async () => {
    const w = world([await user("u1")]);
    await w.caller().account.requestPasswordReset({ email: "jo@example.com" });
    const token = tokenIn(w.outbox[0]);
    for (const [id, t] of w.tokens) w.tokens.set(id, { ...t, expires_at: 1 });
    await expect(
      w.caller().account.resetPassword({ token, newPassword: "a-brand-new-password" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(w.users.get("u1")?.token_version).toBe(0);
  });

  it("refuses a verification link used as a reset link", async () => {
    const w = world();
    await w.caller().account.register({ name: "Jo", email: "jo@example.com", password: "long-enough-pw" });
    const verifyToken = tokenIn(w.outbox[0]);
    await expect(
      w.caller().account.resetPassword({ token: verifyToken, newPassword: "a-brand-new-password" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("explains when email is not set up, and throttles repeated requests", async () => {
    const w = world([await user("u1")]);
    await expect(
      w.caller({ mailer: null }).account.requestPasswordReset({ email: "jo@example.com" }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    const c = w.caller({ ip: "203.0.113.5" });
    for (let i = 0; i < 5; i++) await c.account.requestPasswordReset({ email: "jo@example.com" });
    await expect(c.account.requestPasswordReset({ email: "jo@example.com" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(w.outbox).toHaveLength(5);
  });

  it("rejects a short new password before touching anything", async () => {
    const w = world([await user("u1")]);
    await w.caller().account.requestPasswordReset({ email: "jo@example.com" });
    const token = tokenIn(w.outbox[0]);
    await expect(w.caller().account.resetPassword({ token, newPassword: "short" })).rejects.toThrow();
    expect(w.prisma.authUser.update).not.toHaveBeenCalled();
  });
});
