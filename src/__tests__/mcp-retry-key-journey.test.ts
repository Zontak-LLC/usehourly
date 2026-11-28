import { describe, expect, it } from "vitest";

import { entryRow, setup } from "./helpers/mcp-world";

/**
 * An assistant logs time, loses its connection and sends the same call again. With a retry key the second call returns
 * the first entry; without one it adds another. Only the database is mocked: a small shared table stands in for
 * time_entries and enforces the unique (user_id, retry_key) index of migration 0042.
 */

type Row = ReturnType<typeof entryRow> & { retry_key?: string | null };
type World = ReturnType<typeof setup>;

/** One table of entries shared by every world that is given it (like one database). */
function entryTable() {
  const rows: Row[] = [];
  let next = 0;
  return {
    rows,
    attach(s: World, userId: string) {
      s.prisma.timeEntry.findFirst.mockImplementation(async (a?: unknown) => {
        const where = (a as { where: { user_id: string; retry_key?: string } }).where;
        return rows.find((r) => r.user_id === where.user_id && r.retry_key === where.retry_key) ?? null;
      });
      s.prisma.timeEntry.findMany.mockImplementation(async (a?: unknown) => {
        const where = (a as { where: { user_id: string; retry_key?: { in: string[] } } }).where;
        if (!where.retry_key) return [];
        return rows.filter((r) => r.user_id === where.user_id && where.retry_key?.in.includes(String(r.retry_key)));
      });
      s.prisma.timeEntry.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const key = data.retry_key as string | undefined;
        if (key && rows.some((r) => r.user_id === userId && r.retry_key === key)) {
          throw new Error("UNIQUE constraint failed: time_entries.user_id, time_entries.retry_key");
        }
        const row: Row = entryRow({ ...data, id: String(data.id ?? `e${++next}`), user_id: userId });
        row.retry_key = key ?? null;
        rows.push(row);
        return row;
      });
    },
  };
}

const log = { project: "Acme / Website", date: "2026-10-09", minutes: 90, note: "homepage" };
const idOf = (r: { data?: Record<string, unknown> }) => String((r.data?.logged as { id?: string } | undefined)?.id);

describe("log_time retried with a key", () => {
  it("returns the first entry and adds no second one", async () => {
    const table = entryTable();
    const s = setup();
    table.attach(s, "u1");
    const first = await s.call("log_time", { ...log, key: "retry-1" });
    const second = await s.call("log_time", { ...log, key: "retry-1" });
    expect(first.isError).toBe(false);
    expect(second.isError).toBe(false);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].retry_key).toBe("retry-1");
    expect(idOf(second)).toBe(idOf(first));
    expect(second.data?.logged).toMatchObject({ minutes: 90, note: "homepage" });
  });

  it("without a key still adds two entries with two ids", async () => {
    const table = entryTable();
    const s = setup();
    table.attach(s, "u1");
    const first = await s.call("log_time", log);
    const second = await s.call("log_time", log);
    expect(table.rows).toHaveLength(2);
    expect(idOf(second)).not.toBe(idOf(first));
  });

  it("keeps another account's same key separate", async () => {
    const table = entryTable();
    const a = setup();
    const b = setup({ user: { id: "u2", token_version: 0 } });
    table.attach(a, "u1");
    table.attach(b, "u2");
    const fromA = await a.call("log_time", { ...log, key: "retry-1" });
    const fromB = await b.call("log_time", { ...log, key: "retry-1" });
    expect(table.rows).toHaveLength(2);
    expect(idOf(fromB)).not.toBe(idOf(fromA));
    expect(table.rows.map((r) => r.user_id).sort()).toEqual(["u1", "u2"]);
  });

  it("the first call wins when the retry carries other minutes", async () => {
    const table = entryTable();
    const s = setup();
    table.attach(s, "u1");
    await s.call("log_time", { ...log, key: "retry-1" });
    const again = await s.call("log_time", { ...log, minutes: 30, note: "other", key: "retry-1" });
    expect(table.rows).toHaveLength(1);
    expect(again.data?.logged).toMatchObject({ minutes: 90, note: "homepage" });
  });

  it("hands back the winner when two calls with one key meet at the unique index", async () => {
    const table = entryTable();
    const s = setup();
    table.attach(s, "u1");
    const winner = entryRow({ id: "won", user_id: "u1", minutes: 90, note: "homepage" });
    // The first look finds nothing; the insert loses on the index; the second look finds the winner.
    s.prisma.timeEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    s.prisma.timeEntry.create.mockRejectedValueOnce(new Error("UNIQUE constraint failed: time_entries.retry_key"));
    const r = await s.call("log_time", { ...log, key: "retry-1" });
    expect(r.isError).toBe(false);
    expect(idOf(r)).toBe("won");
    expect(table.rows).toHaveLength(0);
  });

  it("refuses an empty or 101-character key before any insert", async () => {
    const s = setup();
    const empty = await s.call("log_time", { ...log, key: "" });
    const long = await s.call("log_time", { ...log, key: "k".repeat(101) });
    expect(empty.isError).toBe(true);
    expect(long.isError).toBe(true);
    expect(s.prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("is refused for a read-only token, key or not", async () => {
    const s = setup({ access: "read" });
    const r = await s.call("log_time", { ...log, key: "retry-1" });
    expect(r.isError).toBe(true);
    expect(s.prisma.timeEntry.create).not.toHaveBeenCalled();
  });
});

describe("log_time_on_days retried with a key", () => {
  const days = { project: "Acme / Website", dates: ["2026-10-07", "2026-10-08", "2026-10-09"], minutes: 60 };

  it("creates the three days once, then skips all three, even with skip_existing false", async () => {
    const table = entryTable();
    const s = setup();
    table.attach(s, "u1");
    const first = await s.call("log_time_on_days", { ...days, key: "abc" });
    expect(first.data).toMatchObject({ created: 3, skipped: [] });
    const second = await s.call("log_time_on_days", { ...days, key: "abc", skip_existing: false });
    expect(second.data).toMatchObject({ created: 0, skipped: days.dates });
    expect(table.rows.map((r) => r.retry_key)).toEqual(days.dates.map((d) => `abc:${d}`));
  });

  it("counts a day lost on the unique index as skipped", async () => {
    const table = entryTable();
    const s = setup();
    table.attach(s, "u1");
    s.prisma.timeEntry.create.mockRejectedValueOnce(new Error("UNIQUE constraint failed: time_entries.retry_key"));
    const r = await s.call("log_time_on_days", { ...days, key: "abc" });
    expect(r.data).toMatchObject({ created: 2, skipped: ["2026-10-07"] });
  });

  it("refuses a 101-character key before any insert", async () => {
    const s = setup();
    const r = await s.call("log_time_on_days", { ...days, key: "k".repeat(101) });
    expect(r.isError).toBe(true);
    expect(s.prisma.timeEntry.create).not.toHaveBeenCalled();
  });
});
