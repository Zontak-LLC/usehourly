import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { DATE_RE } from "@/lib/dates";
import { isDemoSession } from "@/lib/demo";
import { IMPORT_CHUNK } from "@/lib/import-csv";
import { NOTE_MAX } from "@/lib/notes";
import { assertWithinQuota } from "@/lib/quotas";

import { protectedProcedure, router } from "../trpc";

// D1 allows about 100 bound values per statement, and an entry row binds about nine, so insert in small groups.
const INSERT_GROUP = 8;

const rowSchema = z.object({
  client: z.string().trim().min(1).max(80),
  project: z.string().trim().min(1).max(80),
  date: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
  minutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  note: z.string().max(NOTE_MAX),
  billable: z.boolean().nullable().optional(),
  rateCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
});

const lower = (s: string) => s.trim().toLowerCase();
const isUnique = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

/** The most common value, or undefined for an empty list. */
function mode(values: number[]): number | undefined {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}

export const timeImportRouter = router({
  /**
   * Add entries from a Toggl / Clockify / generic CSV the page has already read and cleaned.
   * Clients and projects are matched by name (any capitalisation) or created; archived ones that
   * receive time are restored. An entry that is already there (same project, day, minutes and
   * description) is skipped, so importing the same file twice changes nothing.
   */
  importRows: protectedProcedure
    .input(z.object({ rows: z.array(rowSchema).min(1).max(IMPORT_CHUNK) }))
    .mutation(async ({ ctx, input }) => {
      const { prisma, userId } = ctx;
      const [clients, projects] = await Promise.all([
        prisma.client.findMany({ where: { user_id: userId }, select: { id: true, name: true, archived: true } }),
        prisma.project.findMany({
          where: { user_id: userId },
          select: { id: true, name: true, client_id: true, archived: true },
        }),
      ]);
      const clientByName = new Map(clients.map((c) => [lower(c.name), c]));
      const projectByKey = new Map(projects.map((p) => [`${p.client_id}\u0000${lower(p.name)}`, p]));

      // What the file needs, in order of first appearance.
      const wantedClients = new Map<string, string>();
      const wantedProjects = new Map<
        string,
        { client: string; name: string; rates: number[]; billable: (boolean | null)[] }
      >();
      for (const r of input.rows) {
        if (!wantedClients.has(lower(r.client))) wantedClients.set(lower(r.client), r.client);
        const key = `${lower(r.client)}\u0000${lower(r.project)}`;
        const cur = wantedProjects.get(key) ?? { client: r.client, name: r.project, rates: [], billable: [] };
        if (r.rateCents != null) cur.rates.push(r.rateCents);
        cur.billable.push(r.billable ?? null);
        wantedProjects.set(key, cur);
      }

      const newClients = [...wantedClients.keys()].filter((k) => !clientByName.has(k));
      const newProjectCount = [...wantedProjects.values()].filter((p) => {
        const c = clientByName.get(lower(p.client));
        return !c || !projectByKey.has(`${c.id}\u0000${lower(p.name)}`);
      }).length;
      assertWithinQuota(clients.length, newClients.length, "clients", isDemoSession(ctx.session));
      assertWithinQuota(projects.length, newProjectCount, "projects", isDemoSession(ctx.session));

      const unarchiveClients = new Set<string>();
      const unarchiveProjects = new Set<string>();
      let clientsCreated = 0;
      let projectsCreated = 0;

      const clientId = async (key: string): Promise<string> => {
        const existing = clientByName.get(key);
        if (existing) {
          if (existing.archived) unarchiveClients.add(existing.id);
          return existing.id;
        }
        const name = wantedClients.get(key) as string;
        try {
          const made = await prisma.client.create({
            data: { user_id: userId, name },
            select: { id: true, name: true },
          });
          clientsCreated++;
          clientByName.set(key, { id: made.id, name: made.name, archived: false });
          return made.id;
        } catch (e) {
          if (!isUnique(e)) throw e; // a second import created it a moment ago
          const again = await prisma.client.findFirst({ where: { user_id: userId, name }, select: { id: true } });
          if (!again) throw e;
          return again.id;
        }
      };

      const projectIds = new Map<string, string>();
      for (const [key, want] of wantedProjects) {
        const cid = await clientId(lower(want.client));
        const pk = `${cid}\u0000${lower(want.name)}`;
        const existing = projectByKey.get(pk);
        if (existing) {
          if (existing.archived) unarchiveProjects.add(existing.id);
          projectIds.set(key, existing.id);
          continue;
        }
        try {
          const made = await prisma.project.create({
            data: {
              user_id: userId,
              client_id: cid,
              name: want.name,
              hourly_rate: mode(want.rates) ?? 0,
              // Non-billable only when the file says so for every row of the project.
              billable: !want.billable.every((b) => b === false),
            },
            select: { id: true },
          });
          projectsCreated++;
          projectByKey.set(pk, { id: made.id, name: want.name, client_id: cid, archived: false });
          projectIds.set(key, made.id);
        } catch (e) {
          if (!isUnique(e)) throw e;
          const again = await prisma.project.findFirst({
            where: { user_id: userId, client_id: cid, name: want.name },
            select: { id: true },
          });
          if (!again) throw e;
          projectIds.set(key, again.id);
        }
      }

      if (unarchiveClients.size) {
        await prisma.client.updateMany({
          where: { user_id: userId, id: { in: [...unarchiveClients] } },
          data: { archived: false },
        });
      }
      if (unarchiveProjects.size) {
        await prisma.project.updateMany({
          where: { user_id: userId, id: { in: [...unarchiveProjects] } },
          data: { archived: false },
        });
      }

      // Skip what is already there: a multiset, so two identical rows in the file are both kept.
      const dates = input.rows.map((r) => r.date).sort();
      const present = await prisma.timeEntry.findMany({
        where: { user_id: userId, date: { gte: dates[0], lte: dates[dates.length - 1] } },
        select: { project_id: true, date: true, minutes: true, note: true },
      });
      const have = new Map<string, number>();
      const entryKey = (projectId: string, date: string, minutes: number, note: string) =>
        `${projectId}\u0000${date}\u0000${minutes}\u0000${note}`;
      for (const e of present) {
        const k = entryKey(e.project_id, e.date, e.minutes, e.note);
        have.set(k, (have.get(k) ?? 0) + 1);
      }

      const toInsert: { user_id: string; project_id: string; date: string; minutes: number; note: string }[] = [];
      let duplicates = 0;
      for (const r of input.rows) {
        const pid = projectIds.get(`${lower(r.client)}\u0000${lower(r.project)}`);
        if (!pid)
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong. Please try again." });
        const k = entryKey(pid, r.date, r.minutes, r.note);
        const n = have.get(k) ?? 0;
        if (n > 0) {
          have.set(k, n - 1);
          duplicates++;
          continue;
        }
        toInsert.push({ user_id: userId, project_id: pid, date: r.date, minutes: r.minutes, note: r.note });
      }

      assertWithinQuota(
        await prisma.timeEntry.count({ where: { user_id: userId } }),
        toInsert.length,
        "entries",
        isDemoSession(ctx.session),
      );
      for (let i = 0; i < toInsert.length; i += INSERT_GROUP) {
        await prisma.timeEntry.createMany({ data: toInsert.slice(i, i + INSERT_GROUP) });
      }
      return { created: toInsert.length, duplicates, clientsCreated, projectsCreated };
    }),
});
