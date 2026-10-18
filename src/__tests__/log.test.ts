import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { describeError, logError, logWarn, requestIdFrom } from "@/lib/log";

/** The logger is what an operator reads at 3am: one parseable line per event, no secrets, never throws. */
describe("structured logging", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => spy.mockRestore());

  const lastLine = () => JSON.parse(String(spy.mock.calls.at(-1)?.[0]));

  it("writes one JSON line with level, event, time and the error's name and message", () => {
    logError("invoice_email_failed", new TypeError("boom"), { invoiceId: "inv_1" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = lastLine();
    expect(line).toMatchObject({
      level: "error",
      event: "invoice_email_failed",
      invoiceId: "inv_1",
      error: { name: "TypeError", message: "boom" },
    });
    expect(new Date(line.time).toString()).not.toBe("Invalid Date");
  });

  it("logs a warning without an error object", () => {
    logWarn("rate_limit_nearly_full", { used: 58 });
    expect(lastLine()).toMatchObject({ level: "warn", event: "rate_limit_nearly_full", used: 58 });
  });

  it("replaces anything under a secret-looking key", () => {
    logError("x", new Error("e"), {
      password: "hunter2",
      apiToken: "uh_abc",
      Authorization: "Bearer z",
      cookie: "a=b",
      signature: "s",
      userId: "u1",
    });
    const line = lastLine();
    for (const k of ["password", "apiToken", "Authorization", "cookie", "signature"]) {
      expect(line[k]).toBe("[redacted]");
    }
    expect(line.userId).toBe("u1");
    expect(JSON.stringify(line)).not.toMatch(/hunter2|uh_abc|Bearer z/);
  });

  it("copes with things that are not Errors and with values JSON cannot print", () => {
    expect(describeError("plain text")).toEqual({ name: "NonError", message: "plain text" });
    expect(describeError({ code: 7 })).toEqual({ name: "NonError", message: '{"code":7}' });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => logError("circular", circular, { circular })).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });

  it("caps a very long stack so one failure cannot flood the log", () => {
    const err = new Error("deep");
    err.stack = `Error: deep\n${"    at frame (file.ts:1:1)\n".repeat(500)}`;
    expect(describeError(err).stack?.length).toBeLessThanOrEqual(1500);
  });

  it("reads Cloudflare's request id when it is there and nothing otherwise", () => {
    expect(requestIdFrom(new Headers({ "cf-ray": "8a1b2c3d4e5f-AMS" }))).toBe("8a1b2c3d4e5f-AMS");
    expect(requestIdFrom(new Headers())).toBeUndefined();
    expect(requestIdFrom(undefined)).toBeUndefined();
  });
});
