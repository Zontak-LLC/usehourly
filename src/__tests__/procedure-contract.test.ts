import { checkProcedureContract } from "quality-gates";
import { describe, expect, it } from "vitest";

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

/**
 * A rule over EVERY tRPC procedure (packages/quality-gates `checkProcedureContract`), so a new one cannot slip past it:
 *  1. Signed out, it is refused with UNAUTHORIZED, unless it is on the public list below.
 *  2. It declares an input schema (the Zod parser), unless it takes no input and is a query on the no-input list.
 * Adding a public procedure means adding it here on purpose, which a reviewer will see.
 */
const PUBLIC = [
  "account.requestPasswordReset",
  "account.resetPassword",
  "account.emailEnabled",
  "account.socialEnabled",
  "account.signupCheck",
  "account.register",
  "account.verifyEmail",
  "timesheetShare.approve",
];

const NO_INPUT_MUTATIONS = ["account.sendVerification", "account.signOutEverywhere", "entry.stop"];

const result = checkProcedureContract({
  router: appRouter,
  caller: createCallerFactory(appRouter)({ session: null, prisma: {} as never }),
  publicProcedures: PUBLIC,
  noInputMutations: NO_INPUT_MUTATIONS,
});

describe("every tRPC procedure", () => {
  it("finds the procedures (guards against the sweep silently testing nothing)", async () => {
    const { names, unknownPublic } = await result;
    expect(names.length).toBeGreaterThan(60);
    expect(unknownPublic).toEqual([]);
  });

  it("refuses a signed-out caller unless it is deliberately public", async () => {
    expect((await result).openToSignedOut).toEqual([]);
  });

  it("validates input on every mutation", async () => {
    // Mutations that genuinely take no input (they act on the signed-in account only) are on NO_INPUT_MUTATIONS.
    expect((await result).mutationsWithoutInput).toEqual([]);
  });
});
