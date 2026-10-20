import type { EntryPatch, EntryRow, NewOp, Op, ProjectRow } from "./types";

/**
 * Adds a change to the waiting list, folding it into an earlier one for the same entry when that is safe:
 * an edit of an entry that has not even been created yet becomes part of the creation; two edits become one; a delete
 * of a not-yet-created entry cancels both; a delete after edits drops the edits. `lockedSeq` is the change being
 * sent right now: it is never altered (the edit would be lost), so a new change simply goes after it.
 */
export function addOp(ops: Op[], op: NewOp, seq: number, lockedSeq: number | null): Op[] {
  const idx = ops.findLastIndex((o) => o.entryId === op.entryId && o.seq !== lockedSeq);
  const earlier = idx >= 0 ? ops[idx] : undefined;
  const without = (i: number) => ops.filter((_, n) => n !== i);

  if (earlier && ops.every((o, n) => n <= idx || o.entryId !== op.entryId)) {
    if (op.kind === "update") {
      if (earlier.kind === "create") return ops.map((o, n) => (n === idx ? applyPatchToCreate(earlier, op.patch) : o));
      if (earlier.kind === "update") {
        return ops.map((o, n) => (n === idx && o.kind === "update" ? { ...o, patch: { ...o.patch, ...op.patch } } : o));
      }
    }
    if (op.kind === "delete") {
      if (earlier.kind === "create") return without(idx); // never reached the server: nothing to tell it
      if (earlier.kind === "update") return [...without(idx), { ...op, seq }];
    }
  }
  return [...ops, { ...op, seq }];
}

function applyPatchToCreate(create: Extract<Op, { kind: "create" }>, patch: EntryPatch): Op {
  return {
    ...create,
    ...(patch.projectId !== undefined && { projectId: patch.projectId }),
    ...(patch.date !== undefined && { date: patch.date }),
    ...(patch.minutes !== undefined && { minutes: patch.minutes }),
    ...(patch.note !== undefined && { note: patch.note }),
  };
}

/** The entries as this device should show them: what the server last sent, with the waiting changes laid on top. */
export function withOps(
  server: ReadonlyMap<string, EntryRow>,
  ops: readonly Op[],
  userId: string,
): Map<string, EntryRow> {
  const rows = new Map(server);
  for (const op of ops) {
    if (op.kind === "create") {
      if (!rows.has(op.entryId)) {
        rows.set(op.entryId, {
          id: op.entryId,
          user_id: userId,
          project_id: op.projectId,
          date: op.date,
          minutes: op.minutes,
          note: op.note,
          started_at: null,
          created_at: op.createdAt,
          updated_at: op.createdAt,
          author_id: null,
        });
      }
    } else if (op.kind === "update") {
      const row = rows.get(op.entryId);
      if (row) {
        rows.set(op.entryId, {
          ...row,
          ...(op.patch.projectId !== undefined && { project_id: op.patch.projectId }),
          ...(op.patch.date !== undefined && { date: op.patch.date }),
          ...(op.patch.minutes !== undefined && { minutes: op.patch.minutes }),
          ...(op.patch.note !== undefined && { note: op.patch.note }),
        });
      }
    } else {
      rows.delete(op.entryId);
    }
  }
  return rows;
}

/** `entry.list` as the server would answer it: newest day first, then newest entry; each row with its project. */
export function listView(
  rows: ReadonlyMap<string, EntryRow>,
  projects: readonly ProjectRow[],
  authors: Readonly<Record<string, string | null>>,
  nonBillable: ReadonlySet<string>,
  range: { from: string; to: string },
) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return [...rows.values()]
    .filter((e) => e.date >= range.from && e.date <= range.to)
    .sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date)))
    .flatMap((e) => {
      const project = byId.get(e.project_id);
      if (!project) return []; // never show a half-built row
      return [
        {
          ...e,
          project,
          author: e.author_id ? { name: authors[e.author_id] ?? null } : null,
          non_billable: nonBillable.has(e.date),
        },
      ];
    });
}
