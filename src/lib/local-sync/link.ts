import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";

import type { AppRouter } from "@/server/routers/_app";

import { LocalRefusal, type SyncEngine } from "./engine";

/** Mutations that change what a pull would bring (entries, projects, clients, imports): after one succeeds on the
 * server, the copy is brought up to date before the caller hears the answer, so the next read already shows it. */
const REFRESH_AFTER = /^(entry|project|clients|timeImport)\./;
/** These three are handled on the device first and sent in the background. */
const LOCAL_MUTATIONS = new Set(["entry.create", "entry.update", "entry.delete"]);

type Params = {
  /** The engine of the signed-in account once its device database is open and the switch is on, else null. */
  engine: () => SyncEngine | null;
};

/**
 * Local-first for time entries (issue #95, spike). Sits in front of the normal HTTP link:
 * - `entry.list` and `entry.nonBillableDays` are answered from the device once it holds a full copy;
 * - `entry.create`, `entry.update` and `entry.delete` are applied on the device and sent later;
 * - everything else goes to the server as before (after which the copy is refreshed where it matters).
 * With no engine (switch off, no database, no copy yet) every call simply passes through, so the app behaves as before.
 */
export function localFirstLink({ engine }: Params): TRPCLink<AppRouter> {
  return () =>
    ({ op, next }) => {
      const e = engine();
      const input = op.input as never;

      if (e?.ready && op.type === "query") {
        if (op.path === "entry.list") return answer(() => e.list(input));
        if (op.path === "entry.nonBillableDays") return answer(() => e.nonBillableDays(input));
      }
      if (e?.ready && op.type === "mutation" && LOCAL_MUTATIONS.has(op.path)) {
        if (op.path === "entry.create") return answer(() => e.create(input));
        if (op.path === "entry.update") return answer(() => e.update(input));
        return answer(() => e.delete(input));
      }
      if (e && op.type === "mutation" && REFRESH_AFTER.test(op.path)) {
        return observable((observer) => {
          let after: Promise<unknown> = Promise.resolve();
          const sub = next(op).subscribe({
            // Bring the copy up to date first, then hand over the answer (and only then say it is complete).
            next: (result) => {
              after = e.sync().then(() => observer.next(result));
            },
            error: (err) => observer.error(err),
            complete: () => void after.then(() => observer.complete()),
          });
          return () => sub.unsubscribe();
        });
      }
      return next(op);
    };
}

function answer(compute: () => unknown) {
  return observable<{ result: { type: "data"; data: never } }, TRPCClientError<AppRouter>>((observer) => {
    try {
      observer.next({ result: { type: "data", data: compute() as never } });
      observer.complete();
    } catch (err) {
      if (err instanceof LocalRefusal) {
        observer.error(
          TRPCClientError.from({
            error: {
              message: err.message,
              code: -32600,
              data: { code: err.code, httpStatus: err.code === "NOT_FOUND" ? 404 : 400 },
            },
          } as never),
        );
      } else {
        observer.error(TRPCClientError.from(err as Error));
      }
    }
  });
}
