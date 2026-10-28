/**
 * A colour per project (Maya's walkthrough, idea 3, 2026-10-26): each project is a shade of its client's colour, so the
 * client still reads at a glance and two projects for one client are told apart. The first project (oldest) keeps the
 * client's colour; later ones step lighter, darker, lighter... Worked out, never stored: nothing to set, no new colour.
 */

/** How far each project after the first moves from the client's colour: + toward white, - toward black. */
const STEPS = [0, 0.45, -0.3, 0.7, -0.5];

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The shade for the project at `rank` (0 = the client's first project) of a client coloured `color`. */
export function shadeOf(color: string, rank: number): string {
  const step = STEPS[rank % STEPS.length];
  const c = rgb(color);
  if (!c || step === 0) return color;
  const target = step > 0 ? 255 : 0;
  const amount = Math.abs(step);
  return `#${c
    .map((v) => Math.round(v + (target - v) * amount))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

type ClientWithProjects = {
  color: string;
  projects: { id: string; created_at: Date | string }[];
};

/** {projectId: shade} for every project in the client list, ranked by when each was made (a new one never shifts the rest). */
export function projectShades(clients: ClientWithProjects[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of clients) {
    const byAge = [...c.projects].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id.localeCompare(b.id),
    );
    byAge.forEach((p, i) => {
      out.set(p.id, shadeOf(c.color, i));
    });
  }
  return out;
}

type ListedClient = {
  name: string;
  color: string;
  projects: { id: string; name: string; created_at: Date | string }[];
};

/** The client list as one list of pickable projects, each with its own shade (Today's picker and the timer share it). */
export function pickableProjects(clients: ListedClient[]) {
  const shades = projectShades(clients);
  return clients.flatMap((c) =>
    c.projects.map((p) => ({ id: p.id, name: p.name, clientName: c.name, color: shades.get(p.id) ?? c.color })),
  );
}
