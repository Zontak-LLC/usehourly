import { describe, expect, it } from "vitest";

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

/**
 * A rule over EVERY tRPC procedure, so a new one cannot slip past it:
 *  1. Signed out, it is refused with UNAUTHORIZED, unless it is on the public list below.
 *  2. It declares an input schema (the Zod parser), unless it takes no input and is a query on the no-input list.
 * Adding a public procedure means adding it here on purpose, which a reviewer will see.
 */
const PUBLIC = new Set([
  "account.requestPasswordReset",
  "account.resetPassword",
  "account.emailEnabled",
  "account.socialEnabled",
  "account.signupCheck",
  "account.register",
  "account.verifyEmail",
  "timesheetShare.approve",
]);

const NO_INPUT_MUTATIONS = new Set(["account.sendVerification", "account.signOutEverywhere", "entry.stop"]);

type ProcDef = { _def: { type: string; inputs: unknown[] } };
const procedures = appRouter._def.procedures as unknown as Record<string, ProcDef>;
const names = Object.keys(procedures);

describe("every tRPC procedure", () => {
  it("finds the procedures (guards against the sweep silently testing nothing)", () => {
    expect(names.length).toBeGreaterThan(60);
    for (const p of PUBLIC) expect(names).toContain(p);
  });

  it("refuses a signed-out caller unless it is deliberately public", async () => {
    const caller = createCallerFactory(appRouter)({ session: null, prisma: {} as never });
    const open: string[] = [];
    for (const name of names) {
      if (PUBLIC.has(name)) continue;
      let code: string | undefined;
      try {
        const [router, proc] = name.split(".") as [string, string];
        // biome-ignore lint/suspicious/noExplicitAny: walking the router by name is the point of this sweep
        await (caller as any)[router][proc](undefined);
      } catch (e) {
        code = (e as { code?: string }).code;
      }
      if (code !== "UNAUTHORIZED") open.push(`${name} -> ${code}`);
    }
    expect(open).toEqual([]);
  });

  it("validates input on every mutation", () => {
    const withoutInput = names.filter(
      (n) => procedures[n]?._def.type === "mutation" && !procedures[n]?._def.inputs.length,
    );
    // Mutations that genuinely take no input (they act on the signed-in account only).
    expect(withoutInput.sort()).toEqual(withoutInput.filter((n) => NO_INPUT_MUTATIONS.has(n)).sort());
  });
});
