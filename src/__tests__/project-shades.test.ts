import { describe, expect, it } from "vitest";

import { pickableProjects, projectShades, shadeOf } from "@/lib/project-shade";

/** A colour per project (Maya's walkthrough, idea 3): each project is a shade of its client's colour. */
const northwind = {
  name: "Northwind Studio",
  color: "#2563c9",
  projects: [
    { id: "support", name: "Monthly support", created_at: "2026-02-01T00:00:00Z" },
    { id: "website", name: "Website redesign", created_at: "2026-01-01T00:00:00Z" },
  ],
};
const fable = {
  name: "Fable Labs",
  color: "#10b981",
  projects: [{ id: "app", name: "Mobile app", created_at: "2026-01-05T00:00:00Z" }],
};

describe("a freelancer with two projects for one client tells them apart by colour", () => {
  it("the oldest project keeps the client's colour and the next one is a lighter shade of it", () => {
    const shades = projectShades([northwind, fable]);
    expect(shades.get("website")).toBe("#2563c9");
    expect(shades.get("support")).toBe("#87a9e1");
    expect(shades.get("app")).toBe("#10b981"); // a client with one project looks exactly as before
  });

  it("adding a newer project never changes the shades already on screen", () => {
    const before = projectShades([northwind]);
    const later = {
      ...northwind,
      projects: [...northwind.projects, { id: "seo", name: "A new SEO job", created_at: "2026-03-01T00:00:00Z" }],
    };
    const after = projectShades([later]);
    expect(after.get("website")).toBe(before.get("website"));
    expect(after.get("support")).toBe(before.get("support"));
    expect(after.get("seo")).toBe(shadeOf("#2563c9", 2)); // the third steps darker
    expect(new Set(after.values()).size).toBe(3);
  });

  it("five projects for one client get five different shades; a colour that is not a hex colour is kept as it is", () => {
    expect(new Set([0, 1, 2, 3, 4].map((i) => shadeOf("#2563c9", i))).size).toBe(5);
    expect(shadeOf("var(--muted)", 1)).toBe("var(--muted)");
  });

  it("Today's picker and the timer list every project with its shade and its client's name", () => {
    expect(pickableProjects([northwind, fable])).toEqual([
      { id: "support", name: "Monthly support", clientName: "Northwind Studio", color: "#87a9e1" },
      { id: "website", name: "Website redesign", clientName: "Northwind Studio", color: "#2563c9" },
      { id: "app", name: "Mobile app", clientName: "Fable Labs", color: "#10b981" },
    ]);
  });
});
