import { vi } from "vitest";

import { hashToken } from "@/lib/email-token";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryRateLimit } from "./memory-rate-limit";

/**
 * An in-memory account world for the sign-off link journeys: two users' entries, their links, the rate limiter and a
 * mailer that records what it sent. Only Prisma and email are faked; the router runs for real.
 */

const createCaller = createCallerFactory(appRouter);

/** Now, in the whole seconds the links store. */
export const nowS = () => Math.floor(Date.now() / 1000);

/** The week every journey shares by default. */
export const range = { from: "2026-10-12", to: "2026-10-18" };

type Entry = {
  id: string;
  user_id: string;
  project_id: string;
  date: string;
  minutes: number;
  note: string;
  started_at: Date | null;
  created_at: Date;
};

/** A stored sign-off link, as the timesheet_shares table holds it. */
export type Share = {
  id: string;
  user_id: string;
  token_hash: string;
  token_prefix: string;
  title: string;
  period_from: string;
  period_to: string;
  snapshot: string;
  expires_at: number;
  revoked_at: number | null;
  approved_name: string | null;
  approved_note: string | null;
  approved_at: number | null;
  created_at: Date;
};

const PROJECTS: Record<string, { name: string; client_id: string; client: { name: string; color: string } }> = {
  p1: { name: "Website", client_id: "acme", client: { name: "Acme", color: "#111" } },
  p2: { name: "App", client_id: "acme", client: { name: "Acme", color: "#111" } },
  p3: { name: "Docs", client_id: "beta", client: { name: "Beta", color: "#222" } },
};

/** Builds a fresh world; `as(userId)` is a caller signed in as that user (null: signed out). */
export function world() {
  const e = (
    user_id: string,
    project_id: string,
    date: string,
    minutes: number,
    note = "",
    started_at: Date | null = null,
  ): Entry => ({
    id: `e${Math.random()}`,
    user_id,
    project_id,
    date,
    minutes,
    note,
    started_at,
    created_at: new Date("2026-10-12"),
  });
  const entries: Entry[] = [
    e("u1", "p1", "2026-10-12", 120, "Built the header"),
    e("u1", "p1", "2026-10-13", 90),
    e("u1", "p2", "2026-10-13", 60, "Login screen"),
    e("u1", "p3", "2026-10-14", 45, "Wrote the README"),
    e("u1", "p1", "2026-10-14", 30, "", new Date("2026-10-14T10:00:00Z")), // a timer still running
    e("u1", "p2", "2026-10-14", 0, "just started"), // zero minutes
    e("u2", "p1", "2026-10-12", 999, "SOMEONE ELSE'S WORK"), // another account entirely
    e("u1", "p1", "2026-11-30", 600, "outside the range"),
  ];
  const shares: Share[] = [];
  const users: Record<
    string,
    {
      name: string;
      business_name: string | null;
      email: string;
      email_verified_at: Date | null;
      email_bounced_at: Date | null;
      is_demo: boolean;
    }
  > = {
    u1: {
      name: "Ada",
      business_name: "Ada Makes Sites",
      email: "ada@example.com",
      email_verified_at: new Date("2026-01-01"),
      email_bounced_at: null,
      is_demo: false,
    },
    u2: {
      name: "Bob",
      business_name: null,
      email: "bob@example.com",
      email_verified_at: null,
      email_bounced_at: null,
      is_demo: false,
    },
  };
  const sent: { to: string; subject: string; text: string }[] = [];
  let mailerOn = true;
  let mailFails = false;
  const limiter = memoryRateLimit();
  let n = 0;
  const matches = (s: Share, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const val = (s as unknown as Record<string, unknown>)[k];
      if (v && typeof v === "object" && "gt" in v) return (val as number) > (v as { gt: number }).gt;
      return val === v;
    });
  const prisma = {
    rateLimit: limiter.rateLimit,
    authUser: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users[where.id] ?? null) },
    timeEntry: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            user_id: string;
            date: { gte: string; lte: string };
            project_id?: string;
            project?: { client_id: string };
          };
        }) =>
          entries
            .filter(
              (x) =>
                x.user_id === where.user_id &&
                x.date >= where.date.gte &&
                x.date <= where.date.lte &&
                (!where.project_id || x.project_id === where.project_id) &&
                (!where.project || PROJECTS[x.project_id].client_id === where.project.client_id),
            )
            .map((x) => ({
              ...x,
              project: {
                name: PROJECTS[x.project_id].name,
                hourly_rate: 9999,
                billable: true,
                client: PROJECTS[x.project_id].client,
              },
            })),
      ),
    },
    timesheetShare: {
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) => shares.filter((s) => matches(s, where)).length,
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<Share, "id" | "created_at" | "revoked_at" | "approved_name" | "approved_note" | "approved_at">;
        }) => {
          const row: Share = {
            id: `s${++n}`,
            created_at: new Date(1_000_000 + n),
            revoked_at: null,
            approved_name: null,
            approved_note: null,
            approved_at: null,
            ...data,
          };
          shares.push(row);
          return { id: row.id };
        },
      ),
      findMany: vi.fn(async ({ where }: { where: { user_id: string } }) =>
        shares
          .filter((s) => s.user_id === where.user_id)
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
          .map(({ snapshot: _drop, token_hash: _h, ...rest }) => rest),
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { token_hash: string } }) =>
          shares.find((s) => s.token_hash === where.token_hash) ?? null,
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Share> }) => {
        const hit = shares.filter((s) => matches(s, where));
        for (const s of hit) Object.assign(s, data);
        return { count: hit.length };
      }),
    },
  };
  const as = (id: string | null, opts: { demo?: boolean; ip?: string } = {}) =>
    createCaller({
      session: id ? ({ user: { id, ...(opts.demo ? { demo: true } : {}) }, expires: "" } as never) : null,
      prisma: prisma as never,
      ip: opts.ip ?? "203.0.113.5",
      mailer: mailerOn
        ? {
            send: async (m: { to: string; subject: string; text: string }) => {
              if (mailFails) throw new Error("the email service is down");
              sent.push(m);
            },
          }
        : null,
      baseUrl: "https://usehourly.app",
    } as never);
  return {
    entries,
    shares,
    prisma,
    as,
    limiter,
    users,
    sent,
    mailer: {
      off: () => {
        mailerOn = false;
      },
      failing: () => {
        mailFails = true;
      },
    },
  };
}

/**
 * Stores a link as if it had been sent before (no `create` call), waiting for approval for 7 more days unless
 * `changes` says otherwise. Returns the stored row.
 */
export async function seedShare(w: ReturnType<typeof world>, token: string, changes: Partial<Share> = {}) {
  const row: Share = {
    id: `old${w.shares.length + 1}`,
    user_id: "u1",
    token_hash: await hashToken(token),
    token_prefix: token.slice(0, 6),
    title: "Acme · Oct 12 – Oct 18, 2026",
    period_from: range.from,
    period_to: range.to,
    snapshot: "{}",
    expires_at: nowS() + 7 * 86_400,
    revoked_at: null,
    approved_name: null,
    approved_note: null,
    approved_at: null,
    created_at: new Date("2026-10-19"),
    ...changes,
  };
  w.shares.push(row);
  return row;
}
