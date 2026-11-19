import { vi } from "vitest";

import { byOrder, type Invoice, type InvoiceOrder } from "./memory-billing";

/*
 * A fake `invoice` table for the history reads (`list`, `listPage`, `countByClient`, `matchTotals`, the MCP invoice
 * tools): it honours the filters' `where`, `orderBy`, `take`, a `cursor` and `groupBy`. Shared by the journeys that
 * seed hundreds of invoices.
 */

/** An invoice row as the history reads it: the list fields, plus the search text and the frozen snapshot. */
export type HistoryRow = Invoice & { search_text: string; snapshot: string };

type DueWhere = null | { not?: null; lt?: string; gte?: string };
type Where = {
  user_id?: string;
  id?: string;
  client_id?: string | { not: null };
  paid_date?: null | { not: null };
  due_date?: DueWhere;
  issue_date?: { gte?: string; lte?: string };
  search_text?: { contains: string };
  OR?: Where[];
};

const dueMatches = (due: string | null | undefined, w: DueWhere) =>
  w === null
    ? !due
    : Boolean(due) && (w.lt === undefined || (due ?? "") < w.lt) && (w.gte === undefined || (due ?? "") >= w.gte);

const clientMatches = (clientId: string | null, w: Where["client_id"]) =>
  w === undefined || (typeof w === "string" ? clientId === w : clientId !== null);

/** Prisma's `where` over the fake table: the fields the history filters on, `OR` included. */
function matches(i: HistoryRow, w: Where): boolean {
  if (w.user_id !== undefined && i.user_id !== w.user_id) return false;
  if (w.id !== undefined && i.id !== w.id) return false;
  if (!clientMatches(i.client_id, w.client_id)) return false;
  if ("paid_date" in w && (w.paid_date === null ? Boolean(i.paid_date) : !i.paid_date)) return false;
  if ("due_date" in w && !dueMatches(i.due_date, w.due_date ?? null)) return false;
  const issued = i.issue_date ?? "";
  if (w.issue_date?.gte && issued < w.issue_date.gte) return false;
  if (w.issue_date?.lte && issued > w.issue_date.lte) return false;
  if (w.search_text && !i.search_text.includes(w.search_text.contains)) return false;
  return !w.OR || w.OR.some((o) => matches(i, o));
}

type GroupKey = "client_id" | "currency";
type Group = { _count: { _all: number }; _sum: { total_cents: number } } & Partial<Record<GroupKey, string>>;

/** Prisma's `groupBy` on one column: a count and a cents sum per value. */
function groupRows(rows: HistoryRow[], key: GroupKey): Group[] {
  const groups = new Map<string, Group>();
  for (const i of rows) {
    const value = i[key] ?? "";
    const g = groups.get(value) ?? { [key]: value, _count: { _all: 0 }, _sum: { total_cents: 0 } };
    g._count._all++;
    g._sum.total_cents += i.total_cents ?? 0;
    groups.set(value, g);
  }
  return [...groups.values()];
}

type FindArgs = {
  where: Where;
  select?: Record<string, true>;
  orderBy?: InvoiceOrder;
  take?: number;
  cursor?: { id: string };
  skip?: number;
};

/** A fake `invoice` table over `table`. Returns it as `prisma.invoice` and on its own, for the spies. */
export function fakeInvoices(table: HistoryRow[]) {
  const invoice = {
    findMany: vi.fn(async (args: FindArgs) => {
      const found = table.filter((i) => matches(i, args.where));
      if (args.orderBy) found.sort(byOrder(args.orderBy));
      // A cursor starts AT its row (the callers pass skip: 0); an unknown cursor finds nothing, as in Prisma.
      const from = args.cursor ? found.findIndex((i) => i.id === args.cursor?.id) : 0;
      if (from < 0) return [];
      const start = from + (args.skip ?? 0);
      return found.slice(start, args.take === undefined ? undefined : start + args.take).map((i) => ({ ...i }));
    }),
    findFirst: vi.fn(async ({ where }: { where: Where }) => table.find((i) => matches(i, where)) ?? null),
    groupBy: vi.fn(async ({ by, where }: { by: [GroupKey]; where: Where }) =>
      groupRows(
        table.filter((i) => matches(i, where)),
        by[0],
      ),
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string; user_id: string }; data: Partial<HistoryRow> }) => {
      const hit = table.find((i) => i.id === where.id && i.user_id === where.user_id);
      if (!hit) throw new Error("Record to update not found.");
      Object.assign(hit, data);
      return { id: hit.id };
    }),
  };
  return { prisma: { invoice }, invoice };
}
