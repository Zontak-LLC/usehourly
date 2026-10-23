import { describe, expect, it } from "vitest";

import {
  billBarDetail,
  clientIdFromPath,
  clientListLine,
  clientPath,
  defaultClientId,
  groupClientList,
  usualRate,
} from "@/lib/client-list";
import { usagePageForPath } from "@/lib/usage";

// Issue #238: the Clients split view. A freelancer with four clients opens Clients: the ones with time to bill come
// first (most money first), the profile of the top one shows, and its bill bar says how much and since when.
const clients = [
  { id: "g", name: "Greyfield Press" },
  { id: "m", name: "My own business" },
  { id: "n", name: "Northwind Studio" },
  { id: "f", name: "Fable Labs" },
];
const cents: Record<string, number> = { f: 107_250, n: 41_250, m: 0, g: 0 };
const month: Record<string, number> = { f: 1230, n: 600, m: 135, g: 0 };

describe("Clients split view: the list", () => {
  it("puts clients with time to bill first, most money first, then the billed-up ones (active before quiet)", () => {
    const groups = groupClientList(
      clients,
      (c) => cents[c.id],
      (c) => month[c.id],
    );
    expect(groups.toBill.map((c) => c.name)).toEqual(["Fable Labs", "Northwind Studio"]);
    expect(groups.billed.map((r) => [r.client.name, r.quiet])).toEqual([
      ["My own business", false],
      ["Greyfield Press", true],
    ]);
    // A wide screen opens the top of the list when the address names no client.
    expect(defaultClientId(groups)).toBe("f");
  });

  it("orders equal amounts by name, and falls back to the first billed-up client when nothing is waiting", () => {
    const groups = groupClientList(
      clients,
      (c) => (c.id === "g" || c.id === "n" ? 500 : 0),
      () => undefined,
    );
    expect(groups.toBill.map((c) => c.id)).toEqual(["g", "n"]);
    const none = groupClientList(
      clients,
      () => 0,
      () => undefined,
    );
    expect(none.toBill).toEqual([]);
    expect(defaultClientId(none)).toBe("f"); // alphabetical, every client active until totals arrive
    expect(defaultClientId({ toBill: [], billed: [] })).toBeNull();
  });

  it("says this month's time, or how long a client has been quiet", () => {
    const today = "2026-10-23";
    expect(clientListLine(750, "2026-10-22", today)).toBe("12:30 this month");
    expect(clientListLine(0, null, today)).toBe("No time yet");
    expect(clientListLine(0, "2026-09-28", today)).toBe("quiet for 3 weeks");
    expect(clientListLine(0, "2026-10-13", today)).toBe("quiet for 10 days");
    expect(clientListLine(0, "2026-10-22", today)).toBe("quiet for 1 day");
    expect(clientListLine(0, "2026-08-01", today)).toBe("quiet for 11 weeks");
    expect(clientListLine(0, "2026-10-01", null)).toBe("No time this month"); // before the browser's date is known
  });
});

describe("Clients split view: the profile", () => {
  it("names the rate that carries most of the client's time, ignoring non-billable and unrated projects", () => {
    const projects = [
      { id: "a", hourly_rate: 9500, billable: true },
      { id: "b", hourly_rate: 8500, billable: true },
      { id: "c", hourly_rate: 9500, billable: true },
      { id: "d", hourly_rate: 20_000, billable: false },
      { id: "e", hourly_rate: 0, billable: true },
    ];
    const minutes: Record<string, number> = { a: 100, b: 150, c: 100, d: 9999, e: 9999 };
    expect(usualRate(projects, (id) => minutes[id])).toBe(9500); // 200 minutes at $95 beats 150 at $85
    expect(usualRate(projects, () => 0)).toBe(9500); // no time yet: the most common rate
    expect(usualRate([projects[3], projects[4]], () => 0)).toBeNull();
    expect(
      usualRate(
        [
          { id: "x", hourly_rate: 5000, billable: true },
          { id: "y", hourly_rate: 7000, billable: true },
        ],
        () => 0,
      ),
    ).toBe(7000); // a full tie goes to the higher rate
  });

  it("writes the bill bar's line: hours, the days they cover and the age of the oldest day", () => {
    const u = { minutes: 690, from: "2026-10-09", to: "2026-10-22" };
    expect(billBarDetail(u, "2026-10-23", "en-US")).toBe("11:30 h from Oct 9 to Oct 22 · oldest day 14 days ago");
    expect(billBarDetail({ minutes: 120, from: "2026-10-22", to: "2026-10-22" }, "2026-10-23", "en-US")).toBe(
      "2:00 h on Oct 22 · oldest day yesterday",
    );
    expect(billBarDetail({ minutes: 30, from: "2026-10-23", to: "2026-10-23" }, "2026-10-23", "en-US")).toBe(
      "0:30 h on Oct 23 · oldest day today",
    );
    // Another year shows its year; before the browser's date is known the age is left out.
    expect(billBarDetail({ minutes: 60, from: "2025-12-30", to: "2026-01-02" }, "2026-01-05", "en-US")).toBe(
      "1:00 h from Dec 30, 2025 to Jan 2 · oldest day 6 days ago",
    );
    expect(billBarDetail(u, null, "en-US")).toBe("11:30 h from Oct 9, 2026 to Oct 22, 2026");
  });

  it("gives each client its own address, which counts as the Clients page", () => {
    expect(clientPath("abc-1")).toBe("/dashboard/clients/abc-1");
    expect(clientIdFromPath("/dashboard/clients/abc-1")).toBe("abc-1");
    expect(clientIdFromPath("/dashboard/clients/abc-1/")).toBe("abc-1");
    expect(clientIdFromPath("/dashboard/clients")).toBeNull();
    expect(clientIdFromPath("/dashboard/clients/archived")).toBeNull();
    expect(clientIdFromPath("/dashboard/clients/a/b")).toBeNull();
    expect(clientIdFromPath("/dashboard/clients/%E0%A4%A")).toBeNull(); // a broken address is no client
    expect(usagePageForPath("/dashboard/clients/abc-1")).toBe("clients");
    expect(usagePageForPath("/dashboard/clients/archived")).toBeNull();
  });
});
