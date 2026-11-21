import { describe, expect, it } from "vitest";

import { isSpeculativePrefetch } from "../../e2e/browser-problems";

/**
 * The browser tests' server-error check: Cloudflare Speed Brain answers its own prefetch of a page with 503 when its
 * cache cannot serve it. Only a request marked `Sec-Purpose: prefetch` is let off; every other 5xx still fails a test.
 */
describe("browser tests: a speculative prefetch is told apart from a real visit", () => {
  it.each(["prefetch", "prefetch;prerender", "prefetch;anonymous-client-ip", "Prefetch"])(
    "sec-purpose %s is a prefetch",
    (value) => {
      expect(isSpeculativePrefetch({ "sec-purpose": value })).toBe(true);
    },
  );

  it.each([
    ["no headers", {}],
    ["a navigation", { "sec-fetch-mode": "navigate" }],
    ["another purpose header", { purpose: "other" }],
  ])("%s is not a prefetch", (_label, headers: Record<string, string>) => {
    expect(isSpeculativePrefetch(headers)).toBe(false);
  });
});
