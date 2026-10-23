import { describe, expect, it } from "vitest";

import { feature } from "@/lib/features";
import {
  allPages,
  entryResults,
  groupResults,
  invoiceResults,
  matchClientsAndProjects,
  matchesAll,
  matchPagesAndSettings,
} from "@/lib/global-search";

const clients = [
  {
    id: "c1",
    name: "Acme Studio",
    projects: [
      { id: "p1", name: "Website" },
      { id: "p2", name: "Brand refresh" },
    ],
  },
  { id: "c2", name: "Fable Labs", projects: [{ id: "p3", name: "Mobile app" }] },
];

/** A person types a few letters in the top bar and finds what they meant, wherever it lives. */
describe("global search", () => {
  it("matches the start of every typed word, ignoring case and punctuation", () => {
    expect(matchesAll("pass", "Change password")).toBe(true);
    expect(matchesAll("change pass", "Change password")).toBe(true);
    expect(matchesAll("  DATA!! ", "Your data")).toBe(true);
    expect(matchesAll("ssword", "Change password")).toBe(false); // the start of a word, not any part
    expect(matchesAll("", "anything")).toBe(false);
  });

  it("finds pages and settings from words in their names or keywords", () => {
    const titles = (q: string) => matchPagesAndSettings(q).map((r) => r.title);
    expect(titles("week")).toContain("Week");
    expect(titles("password")).toContain("Change password");
    expect(titles("currency")).toContain("Currency");
    expect(titles("delete")).toEqual(["Delete account"]);
    expect(titles("zzzz")).toEqual([]);
    const pw = matchPagesAndSettings("password").find((r) => r.title === "Change password");
    expect(pw?.href).toBe("/dashboard/account#account"); // a setting scrolls to its section
    expect(pw?.group).toBe("Settings");
  });

  it("never offers a page or setting whose feature is hidden in this release", () => {
    const titles = (q: string) => matchPagesAndSettings(q).map((r) => r.title);
    expect(titles("xero").includes("Send invoices to Xero or QuickBooks")).toBe(feature("accountingExport"));
    expect(titles("team").includes("Team")).toBe(feature("team"));
    expect(allPages().some((p) => p.href === "/dashboard/team")).toBe(feature("team"));
    expect(titles("friday").includes("Friday reminder email")).toBe(feature("weeklyReminder"));
    expect(titles("toggl").length > 0).toBe(feature("importTime"));
    expect(titles("polish").length > 0).toBe(feature("aiPolish"));
    expect(titles("device").length > 0).toBe(feature("localFirst"));
  });

  it("finds clients and projects by name, a project with its client under it", () => {
    expect(matchClientsAndProjects("acme", clients).map((r) => r.title)).toEqual(["Acme Studio"]);
    const hit = matchClientsAndProjects("brand", clients);
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ title: "Brand refresh", detail: "Acme Studio", href: "/dashboard/clients" });
    expect(matchClientsAndProjects("nothing", clients)).toEqual([]);
  });

  it("an entry result opens that entry's day on Today; an invoice opens Invoices", () => {
    const e = entryResults(
      [{ id: "e1", date: "2026-10-19", minutes: 90, note: "Invoice maths", project: "Website", client: "Acme" }],
      (m) => `${m / 60}h`,
    );
    expect(e[0]).toMatchObject({
      title: "Invoice maths",
      href: "/dashboard/today?date=2026-10-19",
      detail: "2026-10-19 · 1.5h · Website, Acme",
    });
    expect(
      entryResults([{ id: "e2", date: "2026-10-20", minutes: 30, note: "", project: "P", client: "C" }], String)[0]
        .title,
    ).toBe("(no description)");
    expect(invoiceResults([{ id: "i1", number: "INV-2026-001", client_name: "Acme" }])[0]).toMatchObject({
      title: "INV-2026-001",
      href: "/dashboard/invoices",
    });
  });

  it("groups results in a fixed order and leaves out empty groups", () => {
    const mixed = [
      ...invoiceResults([{ id: "i1", number: "INV-1", client_name: "Acme" }]),
      ...matchClientsAndProjects("acme", clients),
      ...matchPagesAndSettings("invoices").slice(0, 1),
    ];
    expect(groupResults(mixed).map((g) => g.group)).toEqual(["Pages", "Clients and projects", "Invoices"]);
    expect(groupResults([])).toEqual([]);
  });
});
