import { DATE_RE, isRealDate } from "@/lib/dates";
import { parseDuration } from "@/lib/duration";
import { needsFullResync } from "@/lib/entry-sync";
import { NOTE_MAX } from "@/lib/notes";

import { addOp, listView, withOps } from "./ops";
import type {
  CreateInput,
  EntryPatch,
  EntryRow,
  Meta,
  NewOp,
  Op,
  ProjectRow,
  PullResult,
  Remote,
  SyncStore,
  UpdateInput,
} from "./types";

/** A change refused on this device before anything was written (the same rules the server applies). */
export class LocalRefusal extends Error {
  constructor(
    message: string,
    readonly code: "BAD_REQUEST" | "NOT_FOUND",
  ) {
    super(message);
  }
}

type Deps = {
  userId: string;
  store: SyncStore;
  remote: Remote;
  /** Called whenever what the screens show may have changed. */
  onChange?: () => void;
  /** Called when the server turned down a change that had already been shown as saved. */
  onRefused?: (message: string) => void;
  now?: () => number;
  uuid?: () => string;
};

/** How a failed call to the server should be treated: try again later, or give up on that change. */
export function classifyFailure(err: unknown): "offline" | "refused" | "gone" {
  const data = (err as { data?: { code?: string; httpStatus?: number } } | null)?.data;
  if (!data || data.httpStatus === undefined) return "offline"; // no answer at all
  if (data.code === "NOT_FOUND") return "gone";
  if (data.httpStatus >= 500 || data.httpStatus === 408 || data.httpStatus === 429) return "offline";
  return "refused";
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : "The server did not accept that change.");

/**
 * The browser's own copy of the account's time entries (issue #95, spike).
 *
 * Reads come from memory (filled from the device's database) so they take no network at all. A write is applied here
 * first and put on a waiting list; `sync()` sends the list in order and then asks the server what changed since the
 * last visit. What the screens show is always the server's last copy with the waiting changes laid on top, so a change
 * made offline stays visible, and a change another device made arrives without disturbing it.
 *
 * Rules (each is pinned by a test): the server stays the authority (it validates, applies quotas and numbers
 * things); two edits of different fields of one entry both survive and the same field edited twice, the later push
 * wins; a delete beats an edit made elsewhere; a refused change disappears again and the person is told.
 */
export class SyncEngine {
  private server = new Map<string, EntryRow>();
  private ops: Op[] = [];
  private meta: Meta;
  private chain: Promise<unknown> = Promise.resolve();
  private lockedSeq: number | null = null;
  private offline = false;

  constructor(private readonly deps: Deps) {
    this.meta = this.emptyMeta();
  }

  private emptyMeta(): Meta {
    return {
      userId: this.deps.userId,
      cursor: null,
      lastPullAt: null,
      projects: [],
      nonBillableDays: [],
      authors: {},
      nextSeq: 1,
    };
  }
  private now = () => (this.deps.now ?? Date.now)();
  private uuid = () => (this.deps.uuid ?? (() => crypto.randomUUID()))();

  /** Loads what the device kept. A copy that belongs to another account is wiped, never shown. */
  async start(): Promise<void> {
    const kept = await this.deps.store.load();
    if (kept.meta && kept.meta.userId !== this.deps.userId) {
      await this.deps.store.clear(false);
      return;
    }
    if (kept.meta) this.meta = kept.meta;
    this.server = new Map(kept.entries.map((e) => [e.id, e]));
    this.ops = kept.ops;
  }

  /** Re-reads the device's database (another tab changed it). */
  async reload(): Promise<void> {
    await this.start();
    this.deps.onChange?.();
  }

  /** True once a full copy has arrived: from then on every read can be answered here. */
  get ready(): boolean {
    return this.meta.cursor !== null;
  }
  get pending(): number {
    return this.ops.length;
  }
  get isOffline(): boolean {
    return this.offline;
  }
  get lastPullAt(): number | null {
    return this.meta.lastPullAt;
  }

  // ---- reads ----------------------------------------------------------------------------------------------------

  list(range: { from: string; to: string }) {
    return listView(
      withOps(this.server, this.ops, this.deps.userId),
      this.meta.projects,
      this.meta.authors,
      new Set(this.meta.nonBillableDays),
      range,
    );
  }

  nonBillableDays(range: { from: string; to: string }): string[] {
    return this.meta.nonBillableDays.filter((d) => d >= range.from && d <= range.to).sort();
  }

  // ---- writes ---------------------------------------------------------------------------------------------------

  create(input: CreateInput) {
    const minutes = input.minutes ?? parseDuration(input.duration ?? "");
    if (!minutes || minutes < 1 || minutes > 24 * 60) {
      throw new LocalRefusal("Couldn't read that duration. Try 1.5, 1:30 or 90m.", "BAD_REQUEST");
    }
    this.checkDate(input.date);
    const note = this.cleanNote(input.note ?? "");
    this.requireProject(input.projectId);
    const entryId = input.clientId ?? this.uuid();
    if (!this.visible().has(entryId)) {
      this.enqueue({
        kind: "create",
        entryId,
        projectId: input.projectId,
        date: input.date,
        minutes,
        note,
        createdAt: new Date(this.now()).toISOString(),
      });
    }
    return this.row(entryId);
  }

  update(input: UpdateInput) {
    if (!this.visible().has(input.id)) throw new LocalRefusal("Entry not found.", "NOT_FOUND");
    const patch: EntryPatch = {};
    if (input.projectId) {
      this.requireProject(input.projectId);
      patch.projectId = input.projectId;
    }
    if (input.date) {
      this.checkDate(input.date);
      patch.date = input.date;
    }
    if (input.minutes) {
      if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 24 * 60) {
        throw new LocalRefusal("Couldn't read that duration. Try 1.5, 1:30 or 90m.", "BAD_REQUEST");
      }
      patch.minutes = input.minutes;
    }
    if (input.note !== undefined) patch.note = this.cleanNote(input.note);
    if (Object.keys(patch).length > 0) this.enqueue({ kind: "update", entryId: input.id, patch });
    return this.row(input.id);
  }

  delete(input: { id: string }) {
    if (!this.visible().has(input.id)) throw new LocalRefusal("Entry not found.", "NOT_FOUND");
    this.enqueue({ kind: "delete", entryId: input.id });
    return { ok: true };
  }

  private visible() {
    return withOps(this.server, this.ops, this.deps.userId);
  }
  private row(id: string) {
    const range = this.visible().get(id);
    if (!range) throw new LocalRefusal("Entry not found.", "NOT_FOUND");
    return this.list({ from: range.date, to: range.date }).find((e) => e.id === id) ?? { ...range };
  }
  private checkDate(date: string) {
    if (!DATE_RE.test(date) || !isRealDate(date)) throw new LocalRefusal("That is not a real date.", "BAD_REQUEST");
  }
  private cleanNote(note: string) {
    const trimmed = note.trim();
    if (trimmed.length > NOTE_MAX)
      throw new LocalRefusal(`Keep the description under ${NOTE_MAX} characters.`, "BAD_REQUEST");
    return trimmed;
  }
  private requireProject(id: string): ProjectRow {
    const project = this.meta.projects.find((p) => p.id === id);
    if (!project) throw new LocalRefusal("Project not found.", "NOT_FOUND");
    return project;
  }

  private enqueue(op: NewOp) {
    this.ops = addOp(this.ops, op, this.meta.nextSeq, this.lockedSeq);
    this.meta = { ...this.meta, nextSeq: this.meta.nextSeq + 1 };
    void this.deps.store.save({ ops: this.ops, meta: this.meta });
    this.deps.onChange?.();
    void this.sync(); // send it now if there is a connection; otherwise it waits
  }

  // ---- sync -----------------------------------------------------------------------------------------------------

  /** Sends the waiting changes, then pulls what changed on the server. One run at a time. */
  sync(): Promise<void> {
    const run = this.chain.then(() => this.cycle());
    this.chain = run.catch(() => undefined);
    return run.catch(() => undefined);
  }

  private async cycle() {
    await this.push();
    if (!this.offline) await this.pull();
  }

  private async push() {
    while (this.ops.length > 0) {
      const op = this.ops[0];
      this.lockedSeq = op.seq;
      try {
        await this.send(op);
        this.offline = false;
      } catch (err) {
        const kind = classifyFailure(err);
        if (kind === "offline") {
          this.offline = true;
          return;
        }
        this.offline = false;
        // The server turned the change down. It stops being shown (the entry returns to what the server holds) and
        // the person is told. A missing entry on an edit/delete means it was deleted elsewhere: nothing to restore.
        if (op.kind !== "delete") {
          this.deps.onRefused?.(
            kind === "gone" ? "An entry you changed was deleted on another device." : messageOf(err),
          );
        }
      } finally {
        this.lockedSeq = null;
      }
      this.ops = this.ops.filter((o) => o.seq !== op.seq);
      await this.deps.store.save({ ops: this.ops });
      this.deps.onChange?.();
    }
  }

  private async send(op: Op) {
    if (op.kind === "create") {
      const saved = await this.deps.remote.create({
        projectId: op.projectId,
        date: op.date,
        minutes: op.minutes,
        note: op.note,
        clientId: op.entryId,
      });
      await this.take([stripToRow(saved)], []);
    } else if (op.kind === "update") {
      const saved = await this.deps.remote.update({ id: op.entryId, ...op.patch });
      await this.take([stripToRow(saved)], []);
    } else {
      try {
        await this.deps.remote.delete({ id: op.entryId });
      } catch (err) {
        if (classifyFailure(err) !== "gone") throw err; // already gone is what we wanted
      }
      await this.take([], [op.entryId]);
    }
  }

  /** Applies entries the server sent (or confirmed) to the kept copy. */
  private async take(upserts: EntryRow[], deletes: string[]) {
    for (const e of upserts) this.server.set(e.id, e);
    for (const id of deletes) this.server.delete(id);
    await this.deps.store.save({ putEntries: upserts, deleteEntries: deletes });
  }

  private async pull() {
    const startOver = this.meta.cursor === null || needsFullResync(this.meta.lastPullAt, this.now());
    let changed = false;
    if (startOver) {
      changed = await this.fullCopy();
    } else {
      for (let guard = 0; guard < 200; guard++) {
        const page = await this.remotePull({ cursor: this.meta.cursor });
        if (!page) return;
        changed = (await this.absorb(page)) || changed;
        if (!page.more) break;
      }
    }
    if (changed) this.deps.onChange?.();
  }

  private async fullCopy(): Promise<boolean> {
    const all: EntryRow[] = [];
    let first: PullResult | null = null;
    let last: PullResult | null = null;
    let after: string | null = null;
    for (let guard = 0; guard < 500; guard++) {
      const page = await this.remotePull({ cursor: null, after });
      if (!page) return false; // offline part-way: keep what we had
      first ??= page;
      last = page;
      all.push(...page.upserts);
      if (!page.more) break;
      after = page.nextAfter;
    }
    if (!first || !last) return false;
    this.server = new Map(all.map((e) => [e.id, e]));
    this.meta = {
      ...this.meta,
      cursor: first.head, // from BEFORE the first page, so a change made meanwhile is replayed next time
      lastPullAt: this.now(),
      projects: last.projects,
      nonBillableDays: last.nonBillableDays,
      authors: last.authors,
    };
    await this.deps.store.save({ replaceEntries: all, meta: this.meta });
    return true;
  }

  private async absorb(page: PullResult): Promise<boolean> {
    const before = JSON.stringify([this.meta.projects, this.meta.nonBillableDays, this.meta.authors]);
    await this.take(page.upserts, page.deletes);
    this.meta = {
      ...this.meta,
      cursor: page.head,
      lastPullAt: this.now(),
      projects: page.projects,
      nonBillableDays: page.nonBillableDays,
      authors: { ...this.meta.authors, ...page.authors },
    };
    await this.deps.store.save({ meta: this.meta });
    const after = JSON.stringify([this.meta.projects, this.meta.nonBillableDays, this.meta.authors]);
    return page.upserts.length > 0 || page.deletes.length > 0 || before !== after;
  }

  private async remotePull(input: { cursor: number | null; after?: string | null }): Promise<PullResult | null> {
    try {
      const page = await this.deps.remote.pull(input);
      this.offline = false;
      return page;
    } catch (err) {
      if (classifyFailure(err) === "offline") {
        this.offline = true;
        return null;
      }
      throw err;
    }
  }
}

/** The server answers writes with the entry plus its project; the copy keeps only the entry's own fields. */
function stripToRow(saved: EntryRow & Record<string, unknown>): EntryRow {
  const { id, user_id, project_id, date, minutes, note, started_at, created_at, updated_at, author_id, invoice_id } =
    saved;
  return {
    id,
    user_id,
    project_id,
    date,
    minutes,
    note,
    started_at,
    created_at,
    updated_at,
    author_id: author_id ?? null,
    invoice_id: invoice_id ?? null,
  };
}
