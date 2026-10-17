import { describe, expect, it, vi } from "vitest";

import { clientIp, clientIpFrom } from "@/lib/client-ip";
import { isRealDate, spanDays } from "@/lib/dates";
import { loginAllowed, loginSucceeded } from "@/lib/login-throttle";
import { cleanClientName, parseRegistration, redirectUriProblem } from "@/lib/oauth";
import { hitRateLimit } from "@/lib/rate-limit";
import { enforceRequestLimits, WRITES_PER_USER } from "@/lib/request-limits";
import { callsInTrpcRequest, MAX_BATCH } from "@/lib/trpc-limits";
import { runHousekeeping } from "@/server/housekeeping";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryRateLimit } from "./helpers/memory-rate-limit";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Abuse and availability hardening from the 2026-10-17 security review: what a hostile visitor can and
 * cannot do with open registration and a few free accounts.
 */

describe("an IPv6 visitor cannot rotate addresses to dodge the limits", () => {
  it("treats every address in one /64 as one connection, and leaves IPv4 alone", () => {
    expect(clientIp("203.0.113.7")).toBe("203.0.113.7");
    const a = clientIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    expect(a).toBe("2001:db8:1:2::/64");
    // the same /64, written another way and with different low bits
    expect(clientIp("2001:0db8:0001:0002:0000:0000:0000:0001")).toBe(a);
    expect(clientIp("2001:DB8:1:2::1")).toBe(a);
    expect(clientIp("2001:db8:1:2:ffff:ffff:ffff:ffff")).toBe(a);
    // another /64 is another connection
    expect(clientIp("2001:db8:1:3::1")).not.toBe(a);
    expect(clientIp("2001:db8:2:2::1")).not.toBe(a);
  });

  it("reads IPv4 hidden inside IPv6, drops a zone id, and never makes an unbounded key", () => {
    expect(clientIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(clientIp("::ffff:cb00:7107")).toBe("203.0.113.7");
    expect(clientIp("fe80::1%eth0")).toBe(clientIp("fe80::2"));
    expect(clientIp("  ")).toBeNull();
    expect(clientIp(null)).toBeNull();
    expect(clientIp(undefined)).toBeNull();
    const weird = clientIp(`not-an-address-${"x".repeat(500)}`);
    expect(weird?.length).toBeLessThanOrEqual(64);
    expect(clientIpFrom(new Headers({ "cf-connecting-ip": "2001:db8::5" }))).toBe("2001:db8:0:0::/64");
    expect(clientIpFrom(new Headers())).toBeNull();
  });

  it("stops 80 sign-ups, each from a fresh address in one /64, at the per-connection limit", async () => {
    const db = memoryRateLimit();
    const results: boolean[] = [];
    for (let i = 0; i < 80; i++) {
      const ip = clientIpFrom(new Headers({ "cf-connecting-ip": `2001:db8:abcd:1:${i.toString(16)}::${i + 1}` }));
      results.push((await hitRateLimit(db as never, `register:${ip}`, 5, 3600)).allowed);
    }
    expect(results.filter(Boolean)).toHaveLength(5);
    expect([...db.rows.keys()]).toEqual(["register:2001:db8:abcd:1::/64"]); // one key, not 80
  });

  it("never reads the raw address header outside the helper (a new call site would reopen the hole)", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "__tests__") walk(path);
        } else if (/\.(ts|tsx)$/.test(name) && !path.endsWith("lib/client-ip.ts")) {
          if (readFileSync(path, "utf8").includes("cf-connecting-ip")) hits.push(path.replace(`${process.cwd()}/`, ""));
        }
      }
    };
    walk(join(process.cwd(), "src"));
    // context.ts only mentions the header in a comment; no code may read it directly.
    expect(hits.filter((h) => !h.endsWith("server/context.ts"))).toEqual([]);
  });
});

describe("limits count every call, not every HTTP request", () => {
  it("counts the calls in a batched tRPC URL, capped at the batch size", () => {
    expect(callsInTrpcRequest("https://usehourly.app/api/trpc/entry.create?batch=1")).toBe(1);
    expect(callsInTrpcRequest("https://usehourly.app/api/trpc/entry.create,entry.list,project.totals?batch=1")).toBe(3);
    const many = Array.from({ length: 50 }, () => "entry.create").join(",");
    expect(callsInTrpcRequest(`https://usehourly.app/api/trpc/${many}?batch=1`)).toBe(MAX_BATCH);
    expect(callsInTrpcRequest("not a url")).toBe(1);
  });

  it("makes a full batch of 20 cost 20, so batching cannot multiply the write limit", async () => {
    const db = memoryRateLimit();
    const batches = WRITES_PER_USER.limit / MAX_BATCH; // 12 batches of 20 use the whole minute
    for (let i = 0; i < batches; i++) {
      await enforceRequestLimits(db as never, { method: "POST", userId: "u1", calls: MAX_BATCH });
    }
    await expect(
      enforceRequestLimits(db as never, { method: "POST", userId: "u1", calls: MAX_BATCH }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // Reads are never counted, and another account has its own allowance.
    await enforceRequestLimits(db as never, { method: "GET", userId: "u1", calls: MAX_BATCH });
    await enforceRequestLimits(db as never, { method: "POST", userId: "u2", calls: MAX_BATCH });
  });

  it("lets a single heavy call through but still counts it", async () => {
    const db = memoryRateLimit();
    await enforceRequestLimits(db as never, { method: "POST", userId: "u1" });
    expect(db.rows.get("write:user:u1")?.count).toBe(1);
  });
});

describe("a stranger cannot lock the real owner out of signing in", () => {
  const owner = "jo@example.com";

  it("blocks a source that keeps guessing one address, but not the owner from somewhere else", async () => {
    const db = memoryRateLimit();
    const attacker = "203.0.113.50";
    const home = "198.51.100.9";
    for (let i = 0; i < 10; i++) expect(await loginAllowed(db as never, owner, attacker)).toBe(true);
    expect(await loginAllowed(db as never, owner, attacker)).toBe(false); // the attacker is stopped
    expect(await loginAllowed(db as never, owner, home)).toBe(true); // the owner is not
    await loginSucceeded(db as never, owner, home);
  });

  it("still stops guessing spread across many connections, at a higher ceiling", async () => {
    const db = memoryRateLimit();
    let allowed = 0;
    for (let i = 0; i < 130; i++) {
      if (await loginAllowed(db as never, owner, `192.0.2.${i + 1}`)) allowed++;
    }
    expect(allowed).toBe(100);
  });

  it("stops one connection trying many addresses", async () => {
    const db = memoryRateLimit();
    let allowed = 0;
    for (let i = 0; i < 60; i++) if (await loginAllowed(db as never, `user${i}@example.com`, "203.0.113.77")) allowed++;
    expect(allowed).toBe(40);
  });

  it("forgets the counters after a correct password", async () => {
    const db = memoryRateLimit();
    for (let i = 0; i < 5; i++) await loginAllowed(db as never, owner, "198.51.100.9");
    await loginSucceeded(db as never, owner, "198.51.100.9");
    expect([...db.rows.keys()].filter((k) => k.includes(owner))).toEqual([]);
  });
});

describe("a sign-in password guess is also limited after sign-in", () => {
  it("stops a stolen session guessing the current password, and forgets the count after the right one", async () => {
    const { hash } = await import("bcryptjs");
    const db = memoryRateLimit();
    const prisma = {
      ...db,
      authUser: {
        findUnique: vi.fn(async () => ({ id: "u1", password_hash: await hash("the-real-one", 4) })),
        update: vi.fn(async () => ({ id: "u1" })),
      },
    };
    const caller = createCallerFactory(appRouter)({
      session: { user: { id: "u1" }, expires: "" },
      prisma: prisma as never,
    });
    for (let i = 0; i < 5; i++) {
      await expect(
        caller.account.changePassword({ currentPassword: `guess${i}`, newPassword: "a-new-password" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // The sixth try is refused before the password is even compared, so even the right one waits.
    await expect(
      caller.account.changePassword({ currentPassword: "the-real-one", newPassword: "a-new-password" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(prisma.authUser.update).not.toHaveBeenCalled();
  });
});

describe("email addresses have a sane length", () => {
  it("refuses a very long address for register and reset before creating anything", async () => {
    const db = memoryRateLimit();
    const prisma = { ...db, authUser: { findUnique: vi.fn(), create: vi.fn() } };
    const caller = createCallerFactory(appRouter)({
      session: null,
      prisma: prisma as never,
      mailer: { send: vi.fn() },
      ip: "203.0.113.1",
    } as never);
    const long = `${"a".repeat(250)}@example.com`;
    await expect(caller.account.register({ name: "X", email: long, password: "longenough1" })).rejects.toThrow();
    await expect(caller.account.requestPasswordReset({ email: long })).rejects.toThrow();
    expect(prisma.authUser.create).not.toHaveBeenCalled();
    expect(db.rows.size).toBe(0); // and no counter row is made for an address that cannot exist
  });
});

describe("OAuth input that could be turned against a person", () => {
  it("refuses redirect schemes that launch other programs, and keeps the ones real clients use", () => {
    for (const bad of [
      "javascript:alert(1)",
      "search-ms:query=x&crumb=location:\\\\evil.example\\share",
      "intent://x#Intent;scheme=http;end",
      "mailto:a@b.c",
      "tel:123",
      "ms-msdt:/id/PCWDiagnostic",
      "ms-officecmd:x",
      "ssh://x",
      "chrome-extension://abc/cb",
    ]) {
      expect(redirectUriProblem(bad), bad).not.toBeNull();
    }
    for (const good of [
      "https://claude.ai/api/mcp/auth_callback",
      "http://127.0.0.1:33418/callback",
      "http://localhost:8080/cb",
      "cursor://anysphere.cursor-retrieval/oauth/callback",
      "vscode://ms-vscode.vscode-mcp/callback",
    ]) {
      expect(redirectUriProblem(good), good).toBeNull();
    }
    expect(redirectUriProblem("http://evil.example/cb")).not.toBeNull();
    expect(redirectUriProblem("https://user:pw@evil.example/cb")).not.toBeNull();
  });

  it("shows an app's self-declared name as plain text, with hidden and reordering characters removed", () => {
    expect(cleanClientName("Claude‮ gnisserp")).toBe("Claude gnisserp");
    expect(cleanClientName("Cla​ude")).toBe("Cla ude");
    expect(cleanClientName("  \u0000 ‪ ")).toBe("MCP client");
    expect(cleanClientName("A   B\n\tC")).toBe("A B C");
    expect(cleanClientName(42)).toBe("MCP client");
    expect(cleanClientName("x".repeat(500))).toHaveLength(100);
    const reg = parseRegistration({ client_name: "Evil‮ App", redirect_uris: ["https://a.example/cb"] });
    expect(reg).toEqual({ ok: true, value: { name: "Evil App", redirectUris: ["https://a.example/cb"] } });
  });
});

describe("old throttle counters and expired links are swept", () => {
  it("deletes only what has long expired, and keeps going when one sweep fails", async () => {
    const now = 2_000_000;
    const prisma = {
      rateLimit: { deleteMany: vi.fn(async () => ({ count: 11 })) },
      emailToken: { deleteMany: vi.fn(async () => Promise.reject(new Error("boom"))) },
      oauthCode: { deleteMany: vi.fn(async () => ({ count: 4 })) },
      timesheetShare: { deleteMany: vi.fn(async () => ({ count: 2 })) },
    };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const done = await runHousekeeping(prisma as never, now);
    quiet.mockRestore();
    expect(done).toEqual({ rateLimits: 11, emailTokens: 0, oauthCodes: 4, timesheetShares: 2 });
    expect(prisma.rateLimit.deleteMany).toHaveBeenCalledWith({ where: { reset_at: { lt: now - 3600 } } });
    expect(prisma.emailToken.deleteMany).toHaveBeenCalledWith({ where: { expires_at: { lt: now - 7 * 86400 } } });
    expect(prisma.oauthCode.deleteMany).toHaveBeenCalledWith({ where: { expires_at: { lt: now - 86400 } } });
    expect(prisma.timesheetShare.deleteMany).toHaveBeenCalledWith({ where: { expires_at: { lt: now - 90 * 86400 } } });
  });
});

describe("dates and ranges", () => {
  it("tells a real calendar date from one that only looks like one", () => {
    expect(isRealDate("2026-02-28")).toBe(true);
    expect(isRealDate("2028-02-29")).toBe(true);
    expect(isRealDate("2026-02-29")).toBe(false);
    expect(isRealDate("2026-99-99")).toBe(false);
    expect(isRealDate("2026-13-01")).toBe(false);
    expect(isRealDate("26-1-1")).toBe(false);
  });

  it("counts the days in a range, both ends included", () => {
    expect(spanDays("2026-10-01", "2026-10-01")).toBe(1);
    expect(spanDays("2026-01-01", "2026-12-31")).toBe(365);
    expect(spanDays("2028-01-01", "2028-12-31")).toBe(366);
  });
});
