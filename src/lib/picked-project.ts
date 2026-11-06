import { pushRecentId } from "./project-picker";

/**
 * Which project the Log time card starts on, and what this browser remembers about it. Plain module (no "use client"):
 * the Log time card, the project picker and the Add a project form all use it.
 */

export const LAST_PROJECT_KEY = "hourly:lastProject";
export const RECENT_PROJECTS_KEY = "hourly:recentProjects";
export const PINNED_PROJECTS_KEY = "hourly:pinnedProjects";

type KeyStore = Pick<Storage, "getItem" | "setItem">;

/** The browser's storage, or null where there is none (the server) or it is blocked. */
export function browserStorage(): KeyStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The project Log time starts on: the remembered one while it still exists, else the NEWEST project (issue 431: testers
 * made a project and then logged to the older "General" without noticing), else none. Without dates, list order wins.
 */
export function startProject(
  projects: readonly { id: string; created_at?: Date | string | null }[],
  remembered: string,
): string {
  if (remembered && projects.some((p) => p.id === remembered)) return remembered;
  let newest = projects[0];
  for (const p of projects) if (madeAt(p.created_at) > madeAt(newest.created_at)) newest = p;
  return newest?.id ?? "";
}

function madeAt(value: Date | string | null | undefined): number {
  const t = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

export function readLastProject(storage: KeyStore | null): string {
  try {
    return storage?.getItem(LAST_PROJECT_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Remembers the project Log time starts on next time. A convenience: blocked storage is ignored. */
export function rememberLastProject(storage: KeyStore | null, id: string): void {
  try {
    storage?.setItem(LAST_PROJECT_KEY, id);
  } catch {
    // Remembering the project is a convenience; ignore storage being unavailable.
  }
}

/** A stored list of project ids (recent or pinned); anything unreadable is an empty list. */
export function readProjectIds(storage: KeyStore | null, key: string): string[] {
  try {
    const v = JSON.parse(storage?.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeProjectIds(storage: KeyStore | null, key: string, ids: string[]): void {
  try {
    storage?.setItem(key, JSON.stringify(ids));
  } catch {
    // Remembering is a convenience; ignore storage being unavailable.
  }
}

/** A project just made becomes the picked one on Log time, and the first of the recent ones (as a pick from the picker). */
export function rememberNewProject(storage: KeyStore | null, id: string): void {
  rememberLastProject(storage, id);
  writeProjectIds(storage, RECENT_PROJECTS_KEY, pushRecentId(readProjectIds(storage, RECENT_PROJECTS_KEY), id));
}
