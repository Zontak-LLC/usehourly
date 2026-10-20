/** What the browser keeps for local-first sync (issue #95, spike). See engine.ts for how the pieces fit. */

/** A time entry as the server stores and sends it (dates arrive as text, exactly as tRPC delivers them). */
export type EntryRow = {
  id: string;
  user_id: string;
  project_id: string;
  date: string;
  minutes: number;
  note: string;
  started_at: string | null;
  created_at: string;
  updated_at: string;
  author_id: string | null;
};

/** A project with its client, as `entry.list` hands them out. */
export type ProjectRow = { id: string } & Record<string, unknown>;

type OpBase = { seq: number; entryId: string };
/** A change made on this device that the server has not accepted yet. Kept in order. */
export type Op =
  | (OpBase & {
      kind: "create";
      projectId: string;
      date: string;
      minutes: number;
      note: string;
      createdAt: string;
    })
  | (OpBase & { kind: "update"; patch: EntryPatch })
  | (OpBase & { kind: "delete" });

/** An op before it is given its place in the list. */
export type NewOp = Op extends infer O ? (O extends Op ? Omit<O, "seq"> : never) : never;

/** The fields an edit may change. Only the fields that were touched are present, so two devices editing different
 * fields of one entry both survive; the same field edited twice, the later push wins. */
export type EntryPatch = { projectId?: string; date?: string; minutes?: number; note?: string };

export type Meta = {
  userId: string;
  /** The server's change-log number this copy is up to date with; null until the first full copy is finished. */
  cursor: number | null;
  lastPullAt: number | null;
  projects: ProjectRow[];
  nonBillableDays: string[];
  authors: Record<string, string | null>;
  nextSeq: number;
};

export type PullResult = {
  full: boolean;
  upserts: EntryRow[];
  deletes: string[];
  head: number;
  more: boolean;
  nextAfter: string | null;
  projects: ProjectRow[];
  nonBillableDays: string[];
  authors: Record<string, string | null>;
};

export type SyncStore = {
  load(): Promise<{ entries: EntryRow[]; ops: Op[]; meta: Meta | null }>;
  save(change: {
    meta?: Meta;
    ops?: Op[];
    putEntries?: EntryRow[];
    deleteEntries?: string[];
    /** Throw away every kept entry and keep exactly these (the first full copy). */
    replaceEntries?: EntryRow[];
  }): Promise<void>;
  /** Forget the copy. With `keepOps` the changes not yet sent stay (they belong to the person and are sent later). */
  clear(keepOps: boolean): Promise<void>;
};

export type CreateInput = {
  projectId: string;
  date: string;
  minutes?: number;
  duration?: string;
  note?: string;
  clientId?: string;
};
export type UpdateInput = { id: string; projectId?: string; date?: string; minutes?: number; note?: string };

export type Remote = {
  pull(input: { cursor: number | null; after?: string | null }): Promise<PullResult>;
  create(input: {
    projectId: string;
    date: string;
    minutes: number;
    note: string;
    clientId: string;
  }): Promise<EntryRow>;
  update(input: UpdateInput): Promise<EntryRow>;
  delete(input: { id: string }): Promise<unknown>;
};
