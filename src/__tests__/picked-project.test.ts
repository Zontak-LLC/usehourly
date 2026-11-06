import { describe, expect, it } from "vitest";

import {
  LAST_PROJECT_KEY,
  RECENT_PROJECTS_KEY,
  readLastProject,
  readProjectIds,
  rememberNewProject,
  startProject,
} from "@/lib/picked-project";

/** Two projects as clients.list lists them (by name), Website made after General. */
const general = { id: "general", created_at: "2026-11-01T09:00:00.000Z" };
const website = { id: "website", created_at: new Date("2026-11-05T10:00:00.000Z") };
const projects = [general, website];

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe("the project Log time starts on (issue 431)", () => {
  it("keeps the remembered project while it is still there", () => {
    expect(startProject(projects, "general")).toBe("general");
  });

  it("starts on the newest project when the remembered one is gone", () => {
    expect(startProject(projects, "archived-long-ago")).toBe("website");
  });

  it("starts on the newest project when nothing is remembered, wherever it sits in the list", () => {
    expect(startProject(projects, "")).toBe("website");
    expect(startProject([website, general], "")).toBe("website");
  });

  it("starts on nothing when there are no projects, and on list order when no project has a date", () => {
    expect(startProject([], "")).toBe("");
    expect(startProject([], "general")).toBe("");
    expect(startProject([{ id: "a" }, { id: "b" }], "")).toBe("a");
  });
});

describe("a project made on Clients becomes the picked one", () => {
  it("is remembered as the last project and put first among the recent ones, once", () => {
    const storage = memoryStorage({ [RECENT_PROJECTS_KEY]: JSON.stringify(["general", "website"]) });
    rememberNewProject(storage, "website");
    expect(readLastProject(storage)).toBe("website");
    expect(readProjectIds(storage, RECENT_PROJECTS_KEY)).toEqual(["website", "general"]);
    // and the start rule then picks it, even over a newer project
    expect(startProject([...projects, { id: "later", created_at: "2026-12-01" }], readLastProject(storage))).toBe(
      "website",
    );
  });

  it("never throws when storage is missing or blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => rememberNewProject(blocked, "website")).not.toThrow();
    expect(() => rememberNewProject(null, "website")).not.toThrow();
    expect(readLastProject(blocked)).toBe("");
    expect(readProjectIds(memoryStorage({ [RECENT_PROJECTS_KEY]: "not json" }), RECENT_PROJECTS_KEY)).toEqual([]);
    expect(LAST_PROJECT_KEY).toBe("hourly:lastProject"); // the saved setting's name never changes (CLAUDE.md)
  });
});
