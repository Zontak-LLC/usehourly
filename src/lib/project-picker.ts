/** Rules for the project picker: a few chips (pinned and recent), everything else behind a search. */

export type PickerProject = { id: string; name: string; clientName: string; color?: string };

/** With this many projects or fewer, every project is a chip and there is no search (a fourth project starts the picker). */
export const ALL_AS_CHIPS = 3;
/** Chips shown when nothing is pinned (or fewer than three are). */
export const BASE_CHIPS = 3;
export const MAX_PINNED = 6;
const MAX_REMEMBERED = 8;
const RECENT_SHOWN = 4;

/** Puts `id` first, drops repeats, keeps the list short. */
export function pushRecentId(ids: string[], id: string): string[] {
  return [id, ...ids.filter((x) => x !== id)].slice(0, MAX_REMEMBERED);
}

/** Pins `id`, or unpins it when it is already pinned. A seventh pin pushes the oldest one out. */
export function togglePinnedId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(-MAX_PINNED);
}

/**
 * The chips to show, in a fixed order: the pinned ones, then the most recently used (as remembered when the page
 * opened), then projects in list order to fill up. The picked project is not moved to the front: picking a chip only
 * marks it as pressed, so nothing slides under the pointer and a quick second tap lands where the person aimed. With
 * pins there is room for all of them (up to six chips); without, three. Ids that no longer exist are ignored.
 */
export function chipProjects(
  projects: PickerProject[],
  recentIds: string[],
  pinnedIds: string[] = [],
): PickerProject[] {
  if (projects.length <= ALL_AS_CHIPS) return projects;
  const byId = new Map(projects.map((p) => [p.id, p]));
  const pinned = pinnedIds.filter((id) => byId.has(id));
  const slots = Math.max(BASE_CHIPS, Math.min(MAX_PINNED, pinned.length));
  const order = [...pinned, ...recentIds, ...projects.map((p) => p.id)];
  const out: PickerProject[] = [];
  for (const id of order) {
    const p = byId.get(id);
    if (p && !out.includes(p)) out.push(p);
    if (out.length === slots) break;
  }
  return out;
}

const words = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * The search results: projects matching every word of `query` against project and client name. Best first: a project
 * whose name starts with what was typed, then one with a word that does, then one that merely contains it, then one
 * matched only through its client. Ties go by project name, then client.
 */
export function rankProjects(projects: PickerProject[], query: string): PickerProject[] {
  const ws = words(query);
  const score = (p: PickerProject) => {
    const name = p.name.toLowerCase();
    if (ws.every((w) => name.startsWith(w))) return 0;
    if (ws.every((w) => name.split(/\s+/).some((n) => n.startsWith(w)))) return 1;
    if (ws.every((w) => name.includes(w))) return 2;
    return 3;
  };
  return projects
    .filter((p) => ws.every((w) => p.name.toLowerCase().includes(w) || p.clientName.toLowerCase().includes(w)))
    .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name) || a.clientName.localeCompare(b.clientName));
}

/** The text cut into pieces, each marked when it matches a typed word (so the match can be shown in bold). `at` is where the piece starts. */
export function highlightParts(text: string, query: string): { text: string; hit: boolean; at: number }[] {
  const ws = words(query).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (ws.length === 0) return [{ text, hit: false, at: 0 }];
  const split = new RegExp(`(${ws.join("|")})`, "gi");
  const exact = new RegExp(`^(${ws.join("|")})$`, "i");
  let at = 0;
  return text
    .split(split)
    .filter((t) => t !== "")
    .map((t) => {
      const part = { text: t, hit: exact.test(t), at };
      at += t.length;
      return part;
    });
}

export type PickerSection = { key: string; title: string | null; color?: string; items: PickerProject[] };

/**
 * What the list shows. Typing: one ranked list. Not typing: the recent projects first, then every project under its
 * client. `flat` is the same rows in the order they appear, which is what the arrow keys walk through.
 */
export function pickerRows(
  projects: PickerProject[],
  query: string,
  recentIds: string[],
): { sections: PickerSection[]; flat: PickerProject[] } {
  if (query.trim()) {
    const items = rankProjects(projects, query);
    return { sections: items.length ? [{ key: "results", title: null, items }] : [], flat: items };
  }
  const byId = new Map(projects.map((p) => [p.id, p]));
  const recent = recentIds.map((id) => byId.get(id)).filter((p): p is PickerProject => !!p);
  const sections: PickerSection[] = [];
  if (recent.length) sections.push({ key: "recent", title: "Recent", items: recent.slice(0, RECENT_SHOWN) });
  const clients = new Map<string, PickerProject[]>();
  for (const p of projects) clients.set(p.clientName, [...(clients.get(p.clientName) ?? []), p]);
  for (const name of [...clients.keys()].sort((a, b) => a.localeCompare(b))) {
    const items = (clients.get(name) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    sections.push({ key: `client:${name}`, title: name, color: items[0]?.color, items });
  }
  return { sections, flat: sections.flatMap((s) => s.items) };
}
