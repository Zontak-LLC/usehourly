/** Rules for the project picker: a few recent projects as chips, everything else behind a search. */

export type PickerProject = { id: string; name: string; clientName: string; color?: string };

/** With this many projects or fewer, every project is a chip and there is no search (a fourth project starts the picker). */
export const ALL_AS_CHIPS = 3;
export const RECENT_CHIPS = 3;
const MAX_REMEMBERED = 8;

/** Puts `id` first, drops repeats, keeps the list short. */
export function pushRecentId(ids: string[], id: string): string[] {
  return [id, ...ids.filter((x) => x !== id)].slice(0, MAX_REMEMBERED);
}

/**
 * The chips to show: the selected project first (so what is picked is always visible), then the most recently used,
 * then projects in list order to fill up. Ids that no longer exist are ignored.
 */
export function chipProjects(projects: PickerProject[], recentIds: string[], selectedId: string): PickerProject[] {
  if (projects.length <= ALL_AS_CHIPS) return projects;
  const byId = new Map(projects.map((p) => [p.id, p]));
  const order = [selectedId, ...recentIds, ...projects.map((p) => p.id)];
  const out: PickerProject[] = [];
  for (const id of order) {
    const p = byId.get(id);
    if (p && !out.includes(p)) out.push(p);
    if (out.length === RECENT_CHIPS) break;
  }
  return out;
}

/**
 * The search list: projects matching every word of `query` against project and client name, in one flat list sorted
 * by project name (then client), so a project is found by what it is called, not by which client it sits under.
 */
export function searchProjects(projects: PickerProject[], query: string): PickerProject[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return projects
    .filter((p) => words.every((w) => p.name.toLowerCase().includes(w) || p.clientName.toLowerCase().includes(w)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.clientName.localeCompare(b.clientName));
}
