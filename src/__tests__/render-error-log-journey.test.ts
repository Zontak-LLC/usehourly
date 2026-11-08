import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { onRequestError } from "@/instrumentation";

/**
 * Incident usehourly:9db3c000cb4bfc80: a server render threw twice, and the logs held only Next's stack frames, no
 * message and no page. Next calls onRequestError for each render error; it must write one render_error line with the
 * message, digest, path (no query) and cf-ray, never the headers or cookies, and it must never throw.
 */

type OnRequestErrorArgs = Parameters<typeof onRequestError>;

const context = {
  routerKind: "App Router",
  routePath: "/dashboard/week",
  routeType: "render",
} as OnRequestErrorArgs[2];
const request = {
  path: "/dashboard/week?project=x&token=abc",
  method: "GET",
  headers: { "cf-ray": "abc-LHR", cookie: "session=abc" },
} as OnRequestErrorArgs[1];

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

function loggedLines(): string[] {
  return consoleError.mock.calls.map((call) => String(call[0]));
}

describe("a server render error is logged as one render_error line", () => {
  it("logs the message, digest, path without query, route and cf-ray", async () => {
    const err = Object.assign(new Error("boom"), { digest: "123" });
    await onRequestError(err, request, context);

    const lines = loggedLines();
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({
      level: "error",
      event: "render_error",
      error: { message: "boom" },
      digest: "123",
      path: "/dashboard/week",
      method: "GET",
      routePath: "/dashboard/week",
      routeType: "render",
      requestId: "abc-LHR",
    });

    // Privacy: no query values, cookies or headers on the line.
    for (const secret of ["token=abc", "project=x", "?", "session=abc", "cookie"])
      expect(lines[0]).not.toContain(secret);
    expect(entry).not.toHaveProperty("headers");
  });

  it("logs a thrown plain object as a NonError", async () => {
    await onRequestError({ reason: "not an Error" }, request, context);

    const lines = loggedLines();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ event: "render_error", error: { name: "NonError" } });
  });

  it("never throws, even with no request and an error whose message getter throws", async () => {
    const hostile = new Error("x");
    Object.defineProperty(hostile, "message", {
      get() {
        throw new Error("getter");
      },
    });

    await expect(
      Promise.resolve().then(() => onRequestError(hostile, undefined as unknown as OnRequestErrorArgs[1], context)),
    ).resolves.toBeUndefined();
    expect(loggedLines()).toHaveLength(1);
  });
});
