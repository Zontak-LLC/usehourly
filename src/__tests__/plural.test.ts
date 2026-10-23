import { describe, expect, it } from "vitest";

import { count, word } from "@/lib/plural";

describe("counts read naturally (the audit found '1 clients', '1 days', '1 sheets')", () => {
  it("uses the singular for exactly one and the plural otherwise", () => {
    expect(count(1, "client")).toBe("1 client");
    expect(count(0, "client")).toBe("0 clients");
    expect(count(3, "day")).toBe("3 days");
    expect(count(1, "other client")).toBe("1 other client");
  });

  it("takes an irregular plural", () => {
    expect(count(2, "entry", "entries")).toBe("2 entries");
    expect(word(1, "Invitation")).toBe("Invitation");
    expect(word(2, "Invitation")).toBe("Invitations");
  });
});
