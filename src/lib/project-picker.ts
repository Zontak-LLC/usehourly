/** Rules for the project picker: a few recent projects as chips, everything else behind a search. */

export type PickerProject = { id: string; name: string; clientName: string };
export type PickerGroup = { clientName: string; projects: PickerProject[] };

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
 * The search list: matches every word of `query` against project and client name, grouped by client. With no query,
 * the recent projects come first as their own group.
 */
export function searchGroups(projects: PickerProject[], recentIds: string[], query: string): PickerGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (p: PickerProject) =>
    words.every((w) => p.name.toLowerCase().includes(w) || p.clientName.toLowerCase().includes(w));
  const found = projects.filter(matches);
  const groups: PickerGroup[] = [];
  if (words.length === 0) {
    const recent = recentIds
      .map((id) => found.find((p) => p.id === id))
      .filter((p): p is PickerProject => p !== undefined)
      .slice(0, RECENT_CHIPS + 2);
    if (recent.length > 0) groups.push({ clientName: "Recent", projects: recent });
  }
  for (const p of found) {
    const g = groups.find((x) => x.clientName === p.clientName && x.clientName !== "Recent");
    if (g) g.projects.push(p);
    else groups.push({ clientName: p.clientName, projects: [p] });
  }
  return groups;
}
