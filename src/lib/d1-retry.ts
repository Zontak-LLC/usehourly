import { logError, logWarn } from "@/lib/log";

/**
 * A D1 binding that retries a READ once or twice when D1 fails it with a short-lived error (Cloudflare documents
 * these, e.g. "Network connection lost", and says to retry). Prisma's D1 adapter reads with
 * `prepare(sql).bind(...).raw()`, so only `raw()` on SQL that starts with SELECT or WITH is retried. Writes (`run`,
 * `exec`, `batch`, `INSERT ... RETURNING` through `raw`) are never retried: a write that failed may still have been
 * applied, and a retry could double it.
 *
 * D1 also says "D1_ERROR: Failed to get session commit token: internal error; reference = …" (issue 410), so any
 * "D1_ERROR: … internal error" counts. A read that fails for good logs `d1_read_failed` with the D1 text, because
 * Prisma's own line only says "Error in performIO: %O" in the live logs. Never log the bind values.
 *
 * Lazy on purpose: wrapping reads nothing from `DB`; every call reaches the real binding at call time. Made per
 * request in `build()` (src/lib/prisma.ts), so nothing is shared across requests (issue 315).
 */
const TRANSIENT = [
  "Network connection lost",
  "storage caused object to be reset",
  "reset because its code was updated",
  "D1_ERROR: internal error",
  "Failed to get session commit token",
];
const INTERNAL = /D1_ERROR:.*internal error/i;
const WAITS_MS = [50, 150];
const READ = /^\s*(SELECT|WITH)\b/i;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

const isTransient = (err: unknown) => {
  const message = messageOf(err);
  return TRANSIENT.some((t) => message.includes(t)) || INTERNAL.test(message);
};

type Statement = D1PreparedStatement;

// each wrapped statement points back at the real one, so `batch` hands D1 its own statements
const real = new WeakMap<object, Statement>();

function wrapStatement(stmt: Statement, sql: string): Statement {
  const wrapped = new Proxy(stmt, {
    get(target, prop) {
      if (prop === "bind") return (...args: unknown[]) => wrapStatement(target.bind(...args), sql);
      if (prop === "raw" && READ.test(sql)) return (...args: unknown[]) => rawWithRetry(target, args);
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  real.set(wrapped, stmt);
  return wrapped;
}

async function rawWithRetry(stmt: Statement, args: unknown[]): Promise<unknown> {
  const raw = stmt.raw as (...a: unknown[]) => Promise<unknown>;
  for (let attempt = 0; ; attempt++) {
    try {
      return await raw.apply(stmt, args);
    } catch (err) {
      const message = messageOf(err).slice(0, 300);
      if (attempt >= WAITS_MS.length || !isTransient(err)) {
        logError("d1_read_failed", err, { message, attempts: attempt + 1 });
        throw err;
      }
      logWarn("d1_retry", { attempt: attempt + 1, message });
      await new Promise((resolve) => setTimeout(resolve, WAITS_MS[attempt]));
    }
  }
}

export function retryTransientD1(DB: D1Database): D1Database {
  // a Proxy reads nothing from `DB` until a property is asked for; `exec` and the rest pass through unchanged
  return new Proxy(DB, {
    get(target, prop) {
      if (prop === "prepare") return (sql: string) => wrapStatement(target.prepare(sql), sql);
      if (prop === "batch") return (statements: Statement[]) => target.batch(statements.map((s) => real.get(s) ?? s));
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
