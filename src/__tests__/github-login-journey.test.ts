import { describe, expect, it, vi } from "vitest";

import { decideGithubSignIn, NO_PASSWORD_HASH, pickVerifiedEmail } from "@/lib/github-login";
import { REGISTER_PER_IP } from "@/lib/rate-limit";
import { resolveGithubUser } from "@/server/github-signin";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

type U = {
  id: string;
  name: string | null;
  email: string;
  password_hash: string;
  github_id: string | null;
  email_verified_at: Date | null;
  is_demo: boolean;
  token_version: number;
};

/** A small stateful stand-in for the users table and the rate limiter, to run whole sign-ins. */
function fakeDb(seed: U[] = []) {
  const users = [...seed];
  const limiter = memoryRateLimit();
  let n = 0;
  const prisma = {
    rateLimit: limiter.rateLimit,
    authUser: {
      findUnique: vi.fn(async ({ where }: { where: { github_id?: string; email?: string; id?: string } }) => {
        const u = users.find(
          (x) =>
            (where.github_id && x.github_id === where.github_id) ||
            (where.email && x.email === where.email) ||
            (where.id && x.id === where.id),
        );
        return u ? { ...u } : null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<U> & { token_version?: number | { increment: number } };
        }) => {
          const u = users.find((x) => x.id === where.id) as U;
          const { token_version, ...rest } = data;
          Object.assign(u, rest);
          if (token_version !== undefined && typeof token_version === "object")
            u.token_version += (token_version as { increment: number }).increment;
          return { ...u };
        },
      ),
      create: vi.fn(async ({ data }: { data: Partial<U> }) => {
        const u = {
          id: `u${++n}`,
          name: null,
          github_id: null,
          email_verified_at: null,
          is_demo: false,
          token_version: 0,
          ...data,
        } as U;
        users.push(u);
        return { ...u };
      }),
    },
  };
  return { prisma: prisma as never, raw: prisma, users, limiter };
}

const user = (over: Partial<U>): U => ({
  id: "u0",
  name: "Old",
  email: "jo@example.com",
  password_hash: "$2b$10$abcdefghijklmnopqrstuv",
  github_id: null,
  email_verified_at: null,
  is_demo: false,
  token_version: 3,
  ...over,
});

const emails = [
  { email: "Jo@Example.com", primary: true, verified: true },
  { email: "jo.work@example.com", primary: false, verified: true },
  { email: "spare@example.com", primary: false, verified: false },
];

describe("choosing the address GitHub vouches for", () => {
  it("prefers the verified primary, falls back to another verified one, never uses an unverified one", () => {
    expect(pickVerifiedEmail(emails)).toBe("jo@example.com");
    expect(
      pickVerifiedEmail([
        { email: "a@b.c", primary: true, verified: false },
        { email: "x@y.z", primary: false, verified: true },
      ]),
    ).toBe("x@y.z");
    expect(pickVerifiedEmail([{ email: "a@b.c", primary: true, verified: false }])).toBeNull();
    expect(pickVerifiedEmail([])).toBeNull();
  });
});

describe("signing in with GitHub", () => {
  it("creates an account for a newcomer: confirmed address, no password, GitHub id kept", async () => {
    const db = fakeDb();
    const r = await resolveGithubUser(db.prisma, {
      githubId: "42",
      emails,
      name: "Jo Rivers",
      login: "jo",
      ip: "1.1.1.1",
    });
    expect(r).toMatchObject({ ok: true, created: true, user: { email: "jo@example.com", name: "Jo Rivers" } });
    expect(db.users[0]).toMatchObject({ github_id: "42", password_hash: NO_PASSWORD_HASH });
    expect(db.users[0].email_verified_at).toBeInstanceOf(Date);
  });

  it("recognises the same GitHub account next time, even after its email changed", async () => {
    const db = fakeDb();
    await resolveGithubUser(db.prisma, { githubId: "42", emails, name: "Jo", login: "jo" });
    const again = await resolveGithubUser(db.prisma, {
      githubId: "42",
      emails: [{ email: "new@elsewhere.com", primary: true, verified: true }],
      login: "jo",
    });
    expect(again).toMatchObject({ ok: true, created: false, user: { email: "jo@example.com" } });
    expect(db.users).toHaveLength(1);
  });

  it("links to an existing account whose address was confirmed, and keeps its password", async () => {
    const db = fakeDb([user({ email_verified_at: new Date() })]);
    const r = await resolveGithubUser(db.prisma, { githubId: "42", emails });
    expect(r).toMatchObject({ ok: true, created: false, user: { id: "u0" } });
    expect(db.users[0]).toMatchObject({ github_id: "42", token_version: 3 });
    expect(db.users[0].password_hash).not.toBe(NO_PASSWORD_HASH);
  });

  it("takes over an account whose address was never confirmed: old password dead, old sessions signed out", async () => {
    const db = fakeDb([user({ email_verified_at: null })]);
    const r = await resolveGithubUser(db.prisma, { githubId: "42", emails });
    expect(r).toMatchObject({ ok: true, user: { id: "u0", token_version: 4 } });
    expect(db.users[0].password_hash).toBe(NO_PASSWORD_HASH);
    expect(db.users[0].email_verified_at).toBeInstanceOf(Date);
  });

  it("refuses an address that belongs to an account linked to a different GitHub account", async () => {
    const db = fakeDb([user({ github_id: "99", email_verified_at: new Date() })]);
    const r = await resolveGithubUser(db.prisma, { githubId: "42", emails });
    expect(r).toEqual({ ok: false, reason: "other-github" });
    expect(db.users[0].github_id).toBe("99");
  });

  it("refuses when GitHub shares no verified address, and creates nothing", async () => {
    const db = fakeDb();
    const r = await resolveGithubUser(db.prisma, {
      githubId: "42",
      emails: [{ email: "a@b.c", primary: true, verified: false }],
    });
    expect(r).toEqual({ ok: false, reason: "no-verified-email" });
    expect(db.raw.authUser.create).not.toHaveBeenCalled();
  });

  it("limits how many accounts one connection can create, but still lets existing GitHub users in", async () => {
    const db = fakeDb();
    for (let i = 0; i < REGISTER_PER_IP.limit; i++) {
      const r = await resolveGithubUser(db.prisma, {
        githubId: `g${i}`,
        emails: [{ email: `p${i}@x.com`, primary: true, verified: true }],
        ip: "9.9.9.9",
      });
      expect(r.ok).toBe(true);
    }
    const blocked = await resolveGithubUser(db.prisma, {
      githubId: "gNew",
      emails: [{ email: "late@x.com", primary: true, verified: true }],
      ip: "9.9.9.9",
    });
    expect(blocked).toEqual({ ok: false, reason: "rate-limited" });
    const existing = await resolveGithubUser(db.prisma, { githubId: "g0", emails, ip: "9.9.9.9" });
    expect(existing.ok).toBe(true);
  });
});

describe("decisions that must not change", () => {
  const known = { id: "u", github_id: null, email_verified_at: new Date(), is_demo: false };
  it("never links a demo account", () => {
    expect(
      decideGithubSignIn({
        githubId: "1",
        verifiedEmail: "a@b.c",
        byGithubId: null,
        byEmail: { ...known, is_demo: true },
      }),
    ).toMatchObject({ action: "refuse" });
  });
});

describe("accounts that have no password", () => {
  const createCaller = createCallerFactory(appRouter);
  it("say so in plain words instead of 'password incorrect' when asked to change it", async () => {
    const prisma = {
      authUser: { findUnique: vi.fn(async () => ({ id: "u1", password_hash: NO_PASSWORD_HASH })), update: vi.fn() },
    };
    const caller = createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });
    await expect(caller.account.changePassword({ currentPassword: "x", newPassword: "longenough1" })).rejects.toThrow(
      /GitHub/,
    );
    expect(prisma.authUser.update).not.toHaveBeenCalled();
  });

  it("report has_password: false from me()", async () => {
    const row = {
      id: "u1",
      name: "Jo",
      email: "jo@example.com",
      created_at: new Date(),
      business_name: null,
      ein: null,
      address: null,
      logo: null,
      payment_instructions: null,
      email_verified_at: new Date(),
      invoice_branding: true,
      is_demo: false,
      weekly_reminder: false,
    };
    const prisma = { authUser: { findUnique: vi.fn(async () => ({ ...row, password_hash: NO_PASSWORD_HASH })) } };
    const caller = createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });
    const me = await caller.account.me();
    expect(me.has_password).toBe(false);
    expect(JSON.stringify(me)).not.toContain("password_hash");
  });
});
