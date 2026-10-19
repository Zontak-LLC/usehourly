import { vi } from "vitest";

type Row = { user_id: string; date: string };
type Where = { user_id: string; date?: string | { gte?: string; lte?: string } };

const matches = (r: Row, w: Where) => {
  if (r.user_id !== w.user_id) return false;
  if (w.date === undefined) return true;
  if (typeof w.date === "string") return r.date === w.date;
  return (!w.date.gte || r.date >= w.date.gte) && (!w.date.lte || r.date <= w.date.lte);
};

/** A stand-in for the non_billable_days table, so tests see exactly what is stored and for whom. */
export function memoryNonBillableDays(initial: Row[] = []) {
  const rows: Row[] = [...initial];
  return {
    nonBillableRows: rows,
    nonBillableDay: {
      findMany: vi.fn(async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where))),
      findUnique: vi.fn(
        async ({ where }: { where: { user_id_date: Row } }) =>
          rows.find((r) => r.user_id === where.user_id_date.user_id && r.date === where.user_id_date.date) ?? null,
      ),
      count: vi.fn(async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where)).length),
      create: vi.fn(async ({ data }: { data: Row }) => {
        rows.push({ user_id: data.user_id, date: data.date });
        return data;
      }),
      deleteMany: vi.fn(async ({ where }: { where: Where }) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) rows.splice(i, 1);
        return { count: before - rows.length };
      }),
    },
  };
}
