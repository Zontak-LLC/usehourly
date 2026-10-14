import { describe, expect, it } from "vitest";

import { DONATE_URL, donateUrl } from "@/lib/donate";

describe("Donation address", () => {
  it("keeps every donation button hidden until an address is set", () => {
    expect(donateUrl("")).toBeNull();
    expect(donateUrl("   ")).toBeNull();
    // the shipped address is a real https page (or empty, which hides everything)
    expect(donateUrl()).toBe(DONATE_URL === "" ? null : donateUrl(DONATE_URL));
    expect(DONATE_URL === "" || DONATE_URL.startsWith("https://")).toBe(true);
  });

  it("accepts a real https page, such as a GitHub Sponsors profile", () => {
    expect(donateUrl("https://github.com/sponsors/dzontak")).toBe("https://github.com/sponsors/dzontak");
  });

  it("refuses anything that is not a plain https link", () => {
    for (const bad of [
      "github.com/sponsors/dzontak",
      "http://github.com/sponsors/x",
      "javascript:alert(1)",
      "mailto:a@b.c",
      "//evil.example",
    ]) {
      expect(donateUrl(bad)).toBeNull();
    }
  });
});
