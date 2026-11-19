import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";

import { errorCode } from "@/lib/error-code";
import { isNotFound } from "@/lib/toast-error";

// Issue 458: the server reads Prisma's code to turn P2025 into NOT_FOUND; the app reads tRPC's code to refresh, not undo.
describe("errorCode (Prisma codes, server side)", () => {
  it("reads the code from an Error and from a plain object", () => {
    expect(errorCode(Object.assign(new Error("gone"), { code: "P2025" }))).toBe("P2025");
    expect(errorCode({ code: "P2002" })).toBe("P2002");
  });

  it("is undefined for anything without a text code", () => {
    for (const value of [null, undefined, "P2025", 42, new Error("plain"), { code: 2025 }]) {
      expect(errorCode(value)).toBeUndefined();
    }
  });
});

describe("isNotFound (tRPC answers, in the browser)", () => {
  const answered = (code: string) =>
    TRPCClientError.from({ error: { message: "x", code: -32004, data: { code, httpStatus: 404 } } });

  it("is true for a NOT_FOUND answer", () => {
    expect(isNotFound(answered("NOT_FOUND"))).toBe(true);
  });

  it("is false for other codes, network errors and values that are not errors", () => {
    expect(isNotFound(answered("BAD_REQUEST"))).toBe(false);
    expect(isNotFound(answered("INTERNAL_SERVER_ERROR"))).toBe(false);
    expect(isNotFound(TRPCClientError.from(new TypeError("Failed to fetch")))).toBe(false);
    expect(isNotFound(new Error("NOT_FOUND"))).toBe(false);
    expect(isNotFound({ data: { code: "NOT_FOUND" } })).toBe(false);
    expect(isNotFound("NOT_FOUND")).toBe(false);
    expect(isNotFound(null)).toBe(false);
  });
});
