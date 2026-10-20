import { describe, expect, it, vi } from "vitest";

import { REGISTER_PER_IP } from "@/lib/rate-limit";
import { decideSocialSignIn, NO_PASSWORD_HASH, pickVerifiedEmail } from "@/lib/social-login";
import { appRouter } from "@/server/routers/_app";
import { resolveSocialUser } from "@/server/social-signin";
import { createCallerFactory } from "@/server/trpc";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

type U = {
  id: string;
  name: string | null;
  email: string;
  password_hash: string;
  github_id: string | null;
  google_id: string | null;
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
      findUnique: vi.fn(
        async ({ where }: { where: { github_id?: string; google_id?: string; email?: string; id?: string } }) => {
          const u = users.find(
            (x) =>
              (where.github_id && x.github_id === where.github_id) ||
              (where.google_id && x.google_id === where.google_id) ||
              (where.email && x.email === where.email) ||
              (where.id && x.id === where.id),
          );
          return u ? { ...u } : null;
        },
      ),
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
          google_id: null,
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
  google_id: null,
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
    const r = await resolveSocialUser(db.prisma, {
      provider: "github",
      providerId: "42",
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
    await resolveSocialUser(db.prisma, { provider: "github", providerId: "42", emails, name: "Jo", login: "jo" });
    const again = await resolveSocialUser(db.prisma, {
      provider: "github",
      providerId: "42",
      emails: [{ email: "new@elsewhere.com", primary: true, verified: true }],
      login: "jo",
    });
    expect(again).toMatchObject({ ok: true, created: false, user: { email: "jo@example.com" } });
    expect(db.users).toHaveLength(1);
  });

  it("takes over a confirmed password account too: the password is dead and other sessions are signed out", async () => {
    // Anyone can register with another person's address and pick the password; confirming the address
    // (or a mail scanner opening the link) must not leave that password alive beside the owner's GitHub.
    const db = fakeDb([user({ email_verified_at: new Date() })]);
    const r = await resolveSocialUser(db.prisma, { provider: "github", providerId: "42", emails });
    expect(r).toMatchObject({ ok: true, created: false, user: { id: "u0", token_version: 4 } });
    expect(db.users[0]).toMatchObject({ github_id: "42", token_version: 4 });
    expect(db.users[0].password_hash).toBe(NO_PASSWORD_HASH);
  });

  it("just links a confirmed account that has no password, leaving its sessions alone", async () => {
    const db = fakeDb([user({ email_verified_at: new Date(), password_hash: NO_PASSWORD_HASH, google_id: "g-1" })]);
    const r = await resolveSocialUser(db.prisma, { provider: "github", providerId: "42", emails });
    expect(r).toMatchObject({ ok: true, user: { id: "u0", token_version: 3 } });
    expect(db.users[0]).toMatchObject({ github_id: "42", google_id: "g-1", token_version: 3 });
  });

  it("never hands the password hash back to the caller", async () => {
    const db = fakeDb([user({ email_verified_at: new Date(), github_id: "42" })]);
    const r = await resolveSocialUser(db.prisma, { provider: "github", providerId: "42", emails });
    expect(r.ok && Object.keys(r.user).sort()).toEqual(["email", "id", "name", "token_version"]);
  });

  it("takes over an account whose address was never confirmed: old password dead, old sessions signed out", async () => {
    const db = fakeDb([user({ email_verified_at: null })]);
    const r = await resolveSocialUser(db.prisma, { provider: "github", providerId: "42", emails });
    expect(r).toMatchObject({ ok: true, user: { id: "u0", token_version: 4 } });
    expect(db.users[0].password_hash).toBe(NO_PASSWORD_HASH);
    expect(db.users[0].email_verified_at).toBeInstanceOf(Date);
  });

  it("refuses an address that belongs to an account linked to a different GitHub account", async () => {
    const db = fakeDb([user({ github_id: "99", email_verified_at: new Date() })]);
    const r = await resolveSocialUser(db.prisma, { provider: "github", providerId: "42", emails });
    expect(r).toEqual({ ok: false, reason: "other-account" });
    expect(db.users[0].github_id).toBe("99");
  });

  it("refuses when GitHub shares no verified address, and creates nothing", async () => {
    const db = fakeDb();
    const r = await resolveSocialUser(db.prisma, {
      provider: "github",
      providerId: "42",
      emails: [{ email: "a@b.c", primary: true, verified: false }],
    });
    expect(r).toEqual({ ok: false, reason: "no-verified-email" });
    expect(db.raw.authUser.create).not.toHaveBeenCalled();
  });

  it("limits how many accounts one connection can create, but still lets existing GitHub users in", async () => {
    const db = fakeDb();
    for (let i = 0; i < REGISTER_PER_IP.limit; i++) {
      const r = await resolveSocialUser(db.prisma, {
        provider: "github",
        providerId: `g${i}`,
        emails: [{ email: `p${i}@x.com`, primary: true, verified: true }],
        ip: "9.9.9.9",
      });
      expect(r.ok).toBe(true);
    }
    const blocked = await resolveSocialUser(db.prisma, {
      provider: "github",
      providerId: "gNew",
      emails: [{ email: "late@x.com", primary: true, verified: true }],
      ip: "9.9.9.9",
    });
    expect(blocked).toEqual({ ok: false, reason: "rate-limited" });
    const existing = await resolveSocialUser(db.prisma, {
      provider: "github",
      providerId: "g0",
      emails,
      ip: "9.9.9.9",
    });
    expect(existing.ok).toBe(true);
  });
});

describe("decisions that must not change", () => {
  const known = { id: "u", linkedId: null, email_verified_at: new Date(), is_demo: false, has_password: false };
  it("never links a demo account", () => {
    expect(
      decideSocialSignIn({
        providerId: "1",
        verifiedEmail: "a@b.c",
        byProviderId: null,
        byEmail: { ...known, is_demo: true },
      }),
    ).toMatchObject({ action: "refuse" });
  });
  it("takes over any account that can sign in with a password, and links one that cannot", () => {
    const decide = (over: object) =>
      decideSocialSignIn({
        providerId: "1",
        verifiedEmail: "a@b.c",
        byProviderId: null,
        byEmail: { ...known, ...over },
      });
    expect(decide({ has_password: true })).toEqual({ action: "take-over", userId: "u" });
    expect(decide({ has_password: true, email_verified_at: null })).toEqual({ action: "take-over", userId: "u" });
    expect(decide({ has_password: false })).toEqual({ action: "link", userId: "u" });
    expect(decide({ has_password: false, email_verified_at: null })).toEqual({ action: "take-over", userId: "u" });
  });
});

describe("signing in with Google", () => {
  const googleEmails = [{ email: "Jo@Example.com", primary: true, verified: true }];

  it("creates an account for a newcomer, with the Google id and no password", async () => {
    const db = fakeDb();
    const r = await resolveSocialUser(db.prisma, {
      provider: "google",
      providerId: "sub-1",
      emails: googleEmails,
      name: "Jo Rivers",
    });
    expect(r).toMatchObject({ ok: true, created: true, user: { email: "jo@example.com", name: "Jo Rivers" } });
    expect(db.users[0]).toMatchObject({ google_id: "sub-1", github_id: null, password_hash: NO_PASSWORD_HASH });
  });

  it("refuses an address Google has not verified, and creates nothing", async () => {
    const db = fakeDb();
    const r = await resolveSocialUser(db.prisma, {
      provider: "google",
      providerId: "sub-1",
      emails: [{ email: "jo@example.com", primary: true, verified: false }],
    });
    expect(r).toEqual({ ok: false, reason: "no-verified-email" });
    expect(db.users).toHaveLength(0);
  });

  it("the same Google account gets back in; takes over a confirmed password account and links a GitHub-made one", async () => {
    const password = fakeDb([user({ email_verified_at: new Date() })]);
    expect(
      await resolveSocialUser(password.prisma, { provider: "google", providerId: "sub-1", emails: googleEmails }),
    ).toMatchObject({ ok: true, user: { id: "u0" } });
    expect(password.users[0]).toMatchObject({ google_id: "sub-1", token_version: 4, password_hash: NO_PASSWORD_HASH });
    expect(
      await resolveSocialUser(password.prisma, { provider: "google", providerId: "sub-1", emails: [] }),
    ).toMatchObject({ ok: true, user: { id: "u0" } });

    const viaGithub = fakeDb([
      user({ github_id: "42", email_verified_at: new Date(), password_hash: NO_PASSWORD_HASH }),
    ]);
    expect(
      await resolveSocialUser(viaGithub.prisma, { provider: "google", providerId: "sub-9", emails: googleEmails }),
    ).toMatchObject({ ok: true, user: { id: "u0" } });
    expect(viaGithub.users[0]).toMatchObject({ github_id: "42", google_id: "sub-9" });
  });

  it("takes over an unconfirmed account the same way GitHub does, and refuses a different Google account", async () => {
    const unconfirmed = fakeDb([user({ email_verified_at: null })]);
    const r = await resolveSocialUser(unconfirmed.prisma, {
      provider: "google",
      providerId: "sub-1",
      emails: googleEmails,
    });
    expect(r).toMatchObject({ ok: true, user: { token_version: 4 } });
    expect(unconfirmed.users[0].password_hash).toBe(NO_PASSWORD_HASH);

    const taken = fakeDb([user({ google_id: "someone-else", email_verified_at: new Date() })]);
    expect(
      await resolveSocialUser(taken.prisma, { provider: "google", providerId: "sub-1", emails: googleEmails }),
    ).toEqual({
      ok: false,
      reason: "other-account",
    });
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
    const prisma = {
      authUser: { findUnique: vi.fn(async () => ({ ...row, password_hash: NO_PASSWORD_HASH })) },
      invoice: { count: vi.fn(async () => 0) }, // me() also asks whether the currency is locked
    };
    const caller = createCaller({ session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never });
    const me = await caller.account.me();
    expect(me.has_password).toBe(false);
    expect(JSON.stringify(me)).not.toContain("password_hash");
  });
});
