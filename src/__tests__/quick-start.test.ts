import { describe, expect, it } from "vitest";

import { DEFAULT_PROJECT_NAME, firstRunNames } from "@/lib/quick-start";

// The first-run card's optional "First project" box (2026-11-06): folded like the client name, empty = "General".
describe("firstRunNames with a first project", () => {
  it("an empty or blank project box gives General", () => {
    expect(firstRunNames("Northwind Bakery")).toEqual({ client: "Northwind Bakery", project: DEFAULT_PROJECT_NAME });
    expect(firstRunNames("Northwind Bakery", "   ")).toEqual({ client: "Northwind Bakery", project: "General" });
  });

  it("trims the project name and makes runs of spaces one", () => {
    expect(firstRunNames("Northwind Bakery", "  New   website ")).toEqual({
      client: "Northwind Bakery",
      project: "New website",
    });
  });

  it("cuts an 81-character project name to 80, like the client name", () => {
    const long = "W".repeat(81);
    expect(firstRunNames("Northwind Bakery", long)?.project).toBe("W".repeat(80));
    expect(firstRunNames(long)?.client).toHaveLength(80);
  });

  it("a blank client gives nothing, whatever the project box says", () => {
    expect(firstRunNames("  ", "Website")).toBeNull();
  });
});
