import { describe, expect, it } from "vitest";

import { forgetSampleCopies, SAMPLE_COPIES } from "@/lib/fresh-start";
import { QUERY_CACHE_KEY } from "@/lib/offline-cache";

function memory(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return { map, removeItem: (k: string) => void map.delete(k) };
}

const kept = {
  [QUERY_CACHE_KEY]: "{}",
  "hourly:lastProject": "sample-project",
  "hourly:recentProjects": '["sample-project"]',
  "hourly:pinnedProjects": '["sample-project"]',
  "hourly:loggedCount": "3",
};

/** A visitor claims the demo; what the browser remembered of the sample data must not come back. */
describe("claiming the demo forgets the sample data kept in the browser", () => {
  it("Start fresh drops the saved copy and every remembered sample project, and nothing else", () => {
    const s = memory(kept);
    forgetSampleCopies(s, true);
    for (const key of SAMPLE_COPIES) expect(s.map.has(key), key).toBe(false);
    expect(s.map.get("hourly:loggedCount")).toBe("3"); // not about the sample data
  });

  it("Keep the work drops only the saved copy (the projects are still there)", () => {
    const s = memory(kept);
    forgetSampleCopies(s, false);
    expect(s.map.has(QUERY_CACHE_KEY)).toBe(false);
    expect(s.map.get("hourly:lastProject")).toBe("sample-project");
  });

  it("blocked storage is not an error", () => {
    expect(() => forgetSampleCopies(null, true)).not.toThrow();
    expect(() =>
      forgetSampleCopies(
        {
          removeItem: () => {
            throw new Error("blocked");
          },
        },
        true,
      ),
    ).not.toThrow();
  });
});
