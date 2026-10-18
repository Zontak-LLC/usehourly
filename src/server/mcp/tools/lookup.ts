import { TRPCError } from "@trpc/server";

import type { Caller } from "./core";
import { norm, round2 } from "./format";

export type FlatProject = {
  id: string;
  name: string;
  client_id: string;
  client: string;
  label: string;
  hourly_rate: number;
  hourly_rate_cents: number;
  billable: boolean;
};

export async function listProjects(c: Caller): Promise<FlatProject[]> {
  const clients = await c.clients.list();
  return clients.flatMap((cl) =>
    cl.projects.map((p) => ({
      id: p.id,
      name: p.name,
      client_id: cl.id,
      client: cl.name,
      label: `${cl.name} / ${p.name}`,
      hourly_rate: round2(p.hourly_rate / 100),
      hourly_rate_cents: p.hourly_rate,
      billable: p.billable,
    })),
  );
}
export function pickProject(list: FlatProject[], ref: string, what = "project"): FlatProject {
  const byId = list.find((p) => p.id === ref);
  if (byId) return byId;
  const q = norm(ref.replace(/\s*[/>:|]\s*/g, " / "));
  const exact = list.filter((p) => norm(p.label) === q);
  if (exact.length === 1) return exact[0];
  const named = list.filter((p) => norm(p.name) === q);
  if (named.length === 1) return named[0];
  const loose = list.filter((p) => norm(p.label).includes(q));
  if (loose.length === 1) return loose[0];
  const candidates = exact.length > 1 ? exact : named.length > 1 ? named : loose;
  if (candidates.length > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `"${ref}" matches more than one ${what}: ${candidates
        .slice(0, 8)
        .map((p) => `"${p.label}"`)
        .join(", ")}. Use the full "Client / Project" name or the id.`,
    });
  }
  throw new TRPCError({
    code: "NOT_FOUND",
    message: `No ${what} matches "${ref}". Available: ${
      list
        .slice(0, 15)
        .map((p) => `"${p.label}"`)
        .join(", ") || "none yet (create a client and project first)"
    }.`,
  });
}

export async function resolveProject(c: Caller, ref: string): Promise<FlatProject> {
  return pickProject(await listProjects(c), ref);
}

export async function resolveClient(c: Caller, ref: string) {
  const clients = await c.clients.list();
  const found = clients.find((x) => x.id === ref) ?? clients.find((x) => norm(x.name) === norm(ref));
  if (!found) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `No client matches "${ref}". Clients: ${clients.map((x) => `"${x.name}"`).join(", ") || "none yet"}.`,
    });
  }
  return found;
}
