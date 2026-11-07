import { describe, expect, it } from "vitest";

import { parseWebsite, WEBSITE_ERROR } from "@/lib/web-address";

describe("parseWebsite: a project's website", () => {
  it("completes a bare address and keeps http and https", () => {
    expect(parseWebsite("magsmith.com")).toEqual({ ok: true, url: "https://magsmith.com/" });
    expect(parseWebsite("https://magsmith.com")).toEqual({ ok: true, url: "https://magsmith.com/" });
    expect(parseWebsite("  HTTPS://MagSmith.com/shop?x=1  ")).toEqual({
      ok: true,
      url: "https://magsmith.com/shop?x=1",
    });
    expect(parseWebsite("http://x.com")).toEqual({ ok: true, url: "http://x.com/" });
  });

  it("reads an empty box as no website", () => {
    for (const nothing of ["", "   ", null, undefined]) expect(parseWebsite(nothing)).toEqual({ ok: true, url: null });
  });

  it("refuses what is not a plain web address, with one plain message", () => {
    const bad = [
      "not a site",
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "ftp://x.com",
      "mailto:a@x.com",
      "https://user:pw@x.com",
      "https://x.com:8080",
      "x.com:8080",
      "localhost",
      "https://x..com",
      `https://x.com/${"a".repeat(301 - "https://x.com/".length)}`,
    ];
    expect(bad.at(-1)).toHaveLength(301);
    for (const text of bad) expect(parseWebsite(text), text).toEqual({ ok: false, message: WEBSITE_ERROR });
    expect(WEBSITE_ERROR).toBe("That doesn't look like a web address. Try magsmith.com.");
  });

  it("takes an address of exactly 300 characters", () => {
    const text = `https://x.com/${"a".repeat(300 - "https://x.com/".length)}`;
    expect(parseWebsite(text)).toEqual({ ok: true, url: text });
  });
});
