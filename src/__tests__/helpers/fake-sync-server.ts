import type {
  EntryRow,
  Meta,
  Op,
  ProjectRow,
  PullResult,
  Remote,
  SyncStore,
  UpdateInput,
} from "@/lib/local-sync/types";

/** A device database that lives in memory (the real one is IndexedDB). */
export function memoryStore(): SyncStore & { snapshot(): { entries: EntryRow[]; ops: Op[]; meta: Meta | null } } {
  let entries = new Map<string, EntryRow>();
  let ops: Op[] = [];
  let meta: Meta | null = null;
  return {
    async load() {
      return { entries: [...entries.values()], ops: structuredClone(ops), meta: structuredClone(meta) };
    },
    async save(c) {
      if (c.replaceEntries) entries = new Map(c.replaceEntries.map((e) => [e.id, structuredClone(e)]));
      for (const e of c.putEntries ?? []) entries.set(e.id, structuredClone(e));
      for (const id of c.deleteEntries ?? []) entries.delete(id);
      if (c.ops) ops = structuredClone(c.ops);
      if (c.meta) meta = structuredClone(c.meta);
    },
    async clear(keepOps) {
      entries = new Map();
      meta = null;
      if (!keepOps) ops = [];
    },
    snapshot: () => ({ entries: [...entries.values()], ops: structuredClone(ops), meta: structuredClone(meta) }),
  };
}

const httpError = (code: string, httpStatus: number, message: string) =>
  Object.assign(new Error(message), { data: { code, httpStatus } });

/**
 * A stand-in for the server with the same observable rules as the real procedures: it validates, keeps a change log
 * (what the triggers do), answers pulls from that log and refuses writes for other accounts' or missing rows. It can be
 * switched off to simulate no connection.
 */
export function fakeServer(userId = "u1") {
  const entries = new Map<string, EntryRow>();
  const log: { seq: number; id: string }[] = [];
  const projects: ProjectRow[] = [{ id: "p1", name: "Site", client: { id: "c1", name: "Acme" } }];
  let nonBillable: string[] = [];
  let tick = 0;
  const state = {
    online: true,
    calls: [] as string[],
    refuseCreates: null as string | null,
    /** Full copies come in pages of this many entries (0 = all at once). */
    pageSize: 0,
    /** Runs after a full-copy page has been read: lets a test change data while the copy is still arriving. */
    afterPage: null as (() => void) | null,
  };

  const stamp = () => new Date(Date.UTC(2026, 9, 20, 12, 0, ++tick)).toISOString();
  const touch = (id: string) => log.push({ seq: log.length + 1, id });
  const gate = () => {
    if (!state.online) throw new Error("fetch failed"); // no .data: a network failure
  };

  const remote: Remote = {
    async pull({ cursor, after }) {
      gate();
      state.calls.push(cursor === null ? "pull:full" : "pull:delta");
      let upserts: EntryRow[];
      let deletes: string[] = [];
      let head = log.length;
      let more = false;
      let nextAfter: string | null = null;
      if (cursor === null) {
        upserts = [...entries.values()].sort((a, b) => a.id.localeCompare(b.id)).filter((e) => !after || e.id > after);
        if (state.pageSize && upserts.length > state.pageSize) {
          upserts = upserts.slice(0, state.pageSize);
          more = true;
          nextAfter = upserts.at(-1)?.id ?? null;
        }
      } else {
        const ids = [...new Set(log.filter((l) => l.seq > cursor).map((l) => l.id))];
        upserts = ids.flatMap((id) => entries.get(id) ?? []);
        deletes = ids.filter((id) => !entries.has(id));
        head = log.length;
      }
      const result: PullResult = {
        full: cursor === null,
        upserts: structuredClone(upserts),
        deletes,
        head,
        more,
        nextAfter,
        projects: structuredClone(projects),
        nonBillableDays: [...nonBillable],
        authors: {},
      };
      queueMicrotask(() => state.afterPage?.());
      return result;
    },
    async create(input) {
      gate();
      state.calls.push(`create:${input.clientId}`);
      if (state.refuseCreates) throw httpError("FORBIDDEN", 403, state.refuseCreates);
      const have = entries.get(input.clientId);
      if (have) return structuredClone(have); // idempotent by clientId
      if (!projects.some((p) => p.id === input.projectId)) throw httpError("NOT_FOUND", 404, "Project not found.");
      const now = stamp();
      const row: EntryRow = {
        id: input.clientId,
        user_id: userId,
        project_id: input.projectId,
        date: input.date,
        minutes: input.minutes,
        note: input.note,
        started_at: null,
        created_at: now,
        updated_at: now,
        author_id: null,
      };
      entries.set(row.id, row);
      touch(row.id);
      return structuredClone(row);
    },
    async update(input: UpdateInput) {
      gate();
      state.calls.push(`update:${input.id}`);
      const row = entries.get(input.id);
      if (!row) throw httpError("NOT_FOUND", 404, "Entry not found.");
      if (input.projectId && !projects.some((p) => p.id === input.projectId)) {
        throw httpError("NOT_FOUND", 404, "Project not found.");
      }
      const next: EntryRow = {
        ...row,
        ...(input.projectId && { project_id: input.projectId }),
        ...(input.date && { date: input.date }),
        ...(input.minutes && { minutes: input.minutes }),
        ...(input.note !== undefined && { note: input.note }),
        updated_at: stamp(),
      };
      entries.set(row.id, next);
      touch(row.id);
      return structuredClone(next);
    },
    async delete({ id }) {
      gate();
      state.calls.push(`delete:${id}`);
      if (!entries.delete(id)) throw httpError("NOT_FOUND", 404, "Entry not found.");
      touch(id);
      return { ok: true };
    },
  };

  return {
    remote,
    state,
    entries,
    /** A change made some other way (another device through the real app, the AI assistant, an import). */
    direct: {
      add(row: Partial<EntryRow> & { id: string }) {
        const now = stamp();
        entries.set(row.id, {
          user_id: userId,
          project_id: "p1",
          date: "2026-10-20",
          minutes: 60,
          note: "",
          started_at: null,
          created_at: now,
          updated_at: now,
          author_id: null,
          ...row,
        });
        touch(row.id);
      },
      edit(id: string, patch: Partial<EntryRow>) {
        const row = entries.get(id);
        if (row) entries.set(id, { ...row, ...patch, updated_at: stamp() });
        touch(id);
      },
      remove(id: string) {
        entries.delete(id);
        touch(id);
      },
      setNonBillable(days: string[]) {
        nonBillable = days;
      },
    },
  };
}
