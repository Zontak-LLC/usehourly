import { describe, expect, it } from "vitest";

import { cleanSupporters, readmeSupportersBlock, SUPPORTERS } from "@/lib/supporters";

describe("Supporters thank-you", () => {
  it("shows nobody and no section when there are no public sponsors yet", () => {
    expect(cleanSupporters([])).toEqual([]);
    expect(cleanSupporters(undefined)).toEqual([]);
    expect(cleanSupporters("not a list")).toEqual([]);
    expect(Array.isArray(SUPPORTERS)).toBe(true);
  });

  it("tidies names, drops duplicates and empties, and only keeps https links", () => {
    const list = cleanSupporters([
      { name: "  Ada   Lovelace ", url: "https://github.com/ada" },
      { name: "ada lovelace", url: "https://github.com/ada2" }, // same person, different case
      { name: "", url: "https://github.com/nobody" },
      { name: "Grace", url: "javascript:alert(1)" },
      { name: "Linus", url: "http://insecure.example" },
      { url: "https://github.com/no-name" },
      null,
      "text",
    ]);
    expect(list).toEqual([
      { name: "Ada Lovelace", url: "https://github.com/ada" },
      { name: "Grace" },
      { name: "Linus" },
    ]);
  });

  it("caps very long names and very long lists", () => {
    const long = "x".repeat(200);
    expect(cleanSupporters([{ name: long }])[0].name).toHaveLength(60);
    const many = Array.from({ length: 500 }, (_, i) => ({ name: `Person ${i}` }));
    expect(cleanSupporters(many)).toHaveLength(200);
  });

  it("writes a README list that cannot be broken by a clever name", () => {
    const url = "https://github.com/sponsors/Zontak-LLC";
    expect(readmeSupportersBlock([], url)).toContain("Be the first");
    const block = readmeSupportersBlock(
      [{ name: "Ada [admin](https://evil.example)", url: "https://github.com/ada" }, { name: "Plain" }],
      url,
    );
    // the brackets and parentheses in a name are escaped, so it stays one harmless link text
    expect(block).toContain("- [Ada \\[admin\\]\\(https://evil\\.example\\)](https://github.com/ada)");
    expect(block).toContain("- Plain");
  });
});
