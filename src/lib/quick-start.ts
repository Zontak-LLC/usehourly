/** Quick picks under "How long?" on Today: tapping one fills the time field. `short` is the phone's shorter wording. */
export const DURATION_CHIPS = [
  { label: "30 min", short: "30m", minutes: 30 },
  { label: "1 hour", short: "1h", minutes: 60 },
  { label: "2 hours", short: "2h", minutes: 120 },
] as const;

/** Name given to the first project when the first-run card's "First project (optional)" box is left empty. */
export const DEFAULT_PROJECT_NAME = "General";

/** Client and project names: trimmed, runs of spaces made one, at most 80 characters (the server's limit). */
const foldName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 80);

/**
 * First run asks for "Your first client" and an optional "First project" (2026-11-06: testers read the old "Who do you
 * work for?" as something other than adding a client, and could not find where projects go). The answers become the
 * client and its first project, "General" when the project box is empty, so time can be logged straight away. Returns
 * null when the client is blank so the form can show a plain-words message.
 */
export function firstRunNames(answer: string, project = ""): { client: string; project: string } | null {
  const client = foldName(answer);
  return client ? { client, project: foldName(project) || DEFAULT_PROJECT_NAME } : null;
}

type FirstRunCandidate = { id: string; name: string; created_at: Date | string; projects: unknown[] };

/**
 * The client a first run that half worked left behind (the client saved, then its project failed): the one with this
 * name (folded like `firstRunNames`, any case) and no projects, the oldest if there are several. Null = make a new one.
 * Pressing Add client again then never makes a second client.
 */
export function pickFirstRunClient(clients: FirstRunCandidate[], name: string): string | null {
  const wanted = foldName(name).toLowerCase();
  const matches = clients
    .filter((c) => c.projects.length === 0 && foldName(c.name).toLowerCase() === wanted)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return matches[0]?.id ?? null;
}

/** What the first-run card saves through: the three tRPC calls, so the flow can be tested without a page. */
export type FirstRunApi = {
  listClients: () => Promise<FirstRunCandidate[]>;
  createClient: (name: string) => Promise<{ id: string }>;
  createProject: (input: { clientId: string; name: string; hourlyRate: number }) => Promise<unknown>;
};

/**
 * Saves the first client and its first project, reusing a client an earlier try left without a project. Throws what
 * the server throws; the card shows it and Add client can be pressed again.
 */
export async function saveFirstRun(
  api: FirstRunApi,
  names: { client: string; project: string },
  hourlyRate: number,
): Promise<{ clientId: string }> {
  const clientId =
    pickFirstRunClient(await api.listClients(), names.client) ?? (await api.createClient(names.client)).id;
  await api.createProject({ clientId, name: names.project, hourlyRate });
  return { clientId };
}
