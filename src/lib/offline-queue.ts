import { DATE_RE } from "@/lib/dates";
import { NOTE_MAX } from "@/lib/notes";
import { isFields, isNumber, isText, isWholeIn } from "@/lib/stored-guards";

/**
 * Entries typed while there is no connection. Each one waits in this browser (localStorage, under the account that
 * typed it) and is sent when the connection is back. The id made here travels with the entry, so sending it twice
 * (a dropped response, two tabs) saves it once. Only adding an entry is queued: edits, deletes and timers need a
 * connection, because they change something that already exists on the server.
 */
export const PENDING_KEY = "hourly:pendingEntries";
/** How many entries can wait on one device. Far more than a day offline needs; stops a runaway queue. */
export const MAX_PENDING = 200;

export type PendingEntry = {
  clientId: string;
  userId: string;
  projectId: string;
  date: string;
  minutes: number;
  note: string;
  createdAt: number;
  /** Set when the server refused the entry (for example its project was deleted); it stays until the person discards it. */
  error?: string;
};

/** The pattern `z.string().uuid()` accepts: an RFC 9562 UUID (versions 1 to 8), or the nil or max UUID. */
const UUID_RE =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

/**
 * One stored entry, checked by hand (no zod in the browser, issue 425) with the rules the zod schema had. Returns only
 * the known fields, as zod did, or null when any rule fails.
 */
function parsePendingEntry(item: unknown): PendingEntry | null {
  if (!isFields(item)) return null;
  const { clientId, userId, projectId, date, minutes, note, createdAt, error } = item;
  if (!isText(clientId) || !UUID_RE.test(clientId)) return null;
  if (!isText(userId, 1) || !isText(projectId, 1)) return null;
  if (!isText(date) || !DATE_RE.test(date)) return null;
  if (!isWholeIn(minutes, 1, 24 * 60) || !isText(note, 0, NOTE_MAX) || !isNumber(createdAt)) return null;
  if (error !== undefined && !isText(error)) return null;
  const entry: PendingEntry = { clientId, userId, projectId, date, minutes, note, createdAt };
  return error === undefined ? entry : { ...entry, error };
}

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** The queue as stored. Anything unreadable or no longer valid is dropped, never trusted. */
export function readPending(storage: StorageLike): PendingEntry[] {
  try {
    const raw: unknown = JSON.parse(storage.getItem(PENDING_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      const entry = parsePendingEntry(item);
      return entry ? [entry] : [];
    });
  } catch {
    return [];
  }
}

function writePending(storage: StorageLike, list: PendingEntry[]): boolean {
  try {
    storage.setItem(PENDING_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // storage full or blocked (a private window)
  }
}

/** Adds one entry to the queue. False when it could not be kept (queue full, or storage unavailable). */
export function addPending(storage: StorageLike, entry: PendingEntry): boolean {
  const list = readPending(storage);
  if (list.some((e) => e.clientId === entry.clientId)) return true;
  if (list.length >= MAX_PENDING) return false;
  return writePending(storage, [...list, entry]);
}

export function removePending(storage: StorageLike, clientId: string): void {
  writePending(
    storage,
    readPending(storage).filter((e) => e.clientId !== clientId),
  );
}

export function markFailed(storage: StorageLike, clientId: string, message: string): void {
  writePending(
    storage,
    readPending(storage).map((e) => (e.clientId === clientId ? { ...e, error: message } : e)),
  );
}

/** Forget the refusal so an entry is tried again (the "Try again" button). */
export function clearFailures(storage: StorageLike, userId: string): void {
  writePending(
    storage,
    readPending(storage).map((e) => {
      if (e.userId !== userId) return e;
      const { error: _error, ...rest } = e;
      return rest;
    }),
  );
}

/** The entries one account typed, oldest first. Another account's entries are never shown or sent. */
export function forUser(list: PendingEntry[], userId: string): PendingEntry[] {
  return list.filter((e) => e.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
}

type MaybeTrpcError = { name?: string; message?: string; cause?: unknown; data?: { httpStatus?: number } | null };

/**
 * True when a failure means "could not reach the server" (so keep the entry and try again), and false when the server
 * answered and said no (so show its message). A gateway error (502, 503, 504) counts as unreachable too.
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (typeof err !== "object" || err === null) return false;
  const e = err as MaybeTrpcError;
  if (e.cause instanceof TypeError) return true;
  // A request that gave up waiting (the timeout in trpc-provider) looks like a lost connection.
  const named = (e.cause ?? err) as { name?: string };
  if (named.name === "TimeoutError" || named.name === "AbortError") return true;
  const status = e.data?.httpStatus;
  if (status === 502 || status === 503 || status === 504) return true;
  if (e.data === undefined || e.data === null)
    return /failed to fetch|network|load failed|fetch failed/i.test(e.message ?? "");
  return false;
}

export type FlushResult = { sent: number; failed: number; offline: boolean };

/**
 * Sends one account's waiting entries, oldest first. Stops at the first sign that the server cannot be reached (the
 * rest wait for next time); an entry the server refuses is marked and skipped so it cannot block the ones behind it.
 */
export async function flushPending(opts: {
  storage: StorageLike;
  userId: string;
  send: (entry: PendingEntry) => Promise<unknown>;
}): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, offline: false };
  const waiting = forUser(readPending(opts.storage), opts.userId).filter((e) => !e.error);
  for (const entry of waiting) {
    try {
      await opts.send(entry);
      removePending(opts.storage, entry.clientId);
      result.sent++;
    } catch (err) {
      if (isNetworkError(err)) {
        result.offline = true;
        return result;
      }
      markFailed(
        opts.storage,
        entry.clientId,
        err instanceof Error ? err.message : "The server could not save this entry.",
      );
      result.failed++;
    }
  }
  return result;
}
