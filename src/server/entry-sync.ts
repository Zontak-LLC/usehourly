import type { PrismaClient } from "@prisma/client";

import { inGroups, SYNC_DELTA_PAGE, SYNC_ID_GROUP, SYNC_SNAPSHOT_PAGE } from "@/lib/entry-sync";

import { nonBillableDates } from "./non-billable";

type Input = { cursor: number | null; after?: string | null };

/**
 * One pull for local-first sync. Every read is filtered by the caller's account (that filter is the isolation
 * boundary, as everywhere else).
 *
 * - `cursor` null: a full copy, a page at a time ordered by id (`after` = the last id of the previous page). `head` is
 *   the log's newest number read BEFORE the first page, so a change made while the pages were being read is replayed
 *   by the next pull instead of being missed (replaying is harmless: an upsert of what the device already has).
 * - `cursor` set: the entries that changed since then. The log says which entries; here each is looked up, so an
 *   entry that still exists is sent whole (`upserts`) and one that is gone is listed in `deletes`.
 *
 * Projects (with their clients), the non-billable days and the names of team members who typed entries travel with
 * every pull: they are small, and they are how the device builds the same list the server would.
 */
export async function pullEntries(prisma: PrismaClient, userId: string, input: Input) {
  const mine = { user_id: userId };
  const { upserts, deletes, head, more, nextAfter } = await readEntries(prisma, mine, input);

  const [projects, days] = await Promise.all([
    prisma.project.findMany({ where: mine, omit: { logo: true }, include: { client: { omit: { logo: true } } } }),
    nonBillableDates(prisma, userId),
  ]);
  const authorIds = [...new Set(upserts.flatMap((e) => (e.author_id ? [e.author_id] : [])))];
  const authors = authorIds.length
    ? await prisma.authUser.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
    : [];
  return {
    full: input.cursor === null,
    upserts,
    deletes,
    head,
    more,
    nextAfter,
    projects,
    nonBillableDays: [...days].sort(),
    authors: Object.fromEntries(authors.map((a) => [a.id, a.name])),
  };
}

async function readEntries(prisma: PrismaClient, mine: { user_id: string }, input: Input) {
  if (input.cursor === null) {
    // The log's newest number first, then the page: in that order, so nothing changes unseen between the two.
    const newest = await prisma.entryChange.findFirst({ orderBy: { seq: "desc" }, select: { seq: true } });
    const rows = await prisma.timeEntry.findMany({
      where: { ...mine, ...(input.after ? { id: { gt: input.after } } : {}) },
      orderBy: { id: "asc" },
      take: SYNC_SNAPSHOT_PAGE + 1,
    });
    const more = rows.length > SYNC_SNAPSHOT_PAGE;
    const upserts = more ? rows.slice(0, SYNC_SNAPSHOT_PAGE) : rows;
    return {
      upserts,
      deletes: [] as string[],
      head: newest?.seq ?? 0,
      more,
      nextAfter: more ? (upserts.at(-1)?.id ?? null) : null,
    };
  }

  const log = await prisma.entryChange.findMany({
    where: { ...mine, seq: { gt: input.cursor } },
    orderBy: { seq: "asc" },
    take: SYNC_DELTA_PAGE + 1,
  });
  const more = log.length > SYNC_DELTA_PAGE;
  const page = more ? log.slice(0, SYNC_DELTA_PAGE) : log;
  const ids = [...new Set(page.map((c) => c.entry_id))];
  const found = (
    await Promise.all(
      inGroups(ids, SYNC_ID_GROUP).map((g) => prisma.timeEntry.findMany({ where: { ...mine, id: { in: g } } })),
    )
  ).flat();
  const present = new Set(found.map((e) => e.id));
  return {
    upserts: found,
    deletes: ids.filter((id) => !present.has(id)),
    // With nothing new the cursor stays where it was; with a full page it moves to the last row read.
    head: page.at(-1)?.seq ?? input.cursor,
    more,
    nextAfter: null,
  };
}
