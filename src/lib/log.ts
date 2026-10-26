/**
 * Structured logging: one JSON object per line, so Cloudflare's log viewer (and any log shipper) can
 * filter on `event`, `level` or `requestId` instead of grepping prose. Both levels go through
 * console.error on purpose: production builds strip every other console method (see next.config.mjs).
 *
 * Never put a password, token, key, cookie or a whole request body in `fields`; values under a key
 * that looks like one are replaced as a safety net, not as a licence.
 */
export type LogLevel = "warn" | "error";

type Fields = Record<string, unknown>;

const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|signature/i;
const MAX_STACK = 1500;
const MAX_CAUSE = 500;
const CAUSE_DEPTH = 3;

type Cause = { name: string; message: string; cause?: Cause };

export function describeError(err: unknown): { name: string; message: string; stack?: string; cause?: Cause } {
  if (err instanceof Error) {
    const cause = describeCause(err.cause, 1);
    return { name: err.name, message: err.message, stack: err.stack?.slice(0, MAX_STACK), ...(cause ? { cause } : {}) };
  }
  return { name: "NonError", message: typeof err === "string" ? err : safeString(err) };
}

/** A `cause` (an Error, or a plain object such as a driver adapter's `{ originalMessage, kind }`), 3 levels at most. */
function describeCause(value: unknown, depth: number): Cause | undefined {
  if (value === undefined || value === null || depth > CAUSE_DEPTH) return undefined;
  let out: Cause;
  if (value instanceof Error) out = { name: value.name, message: value.message.slice(0, MAX_CAUSE) };
  else {
    const o = value as { originalMessage?: unknown; message?: unknown };
    const text =
      typeof o.originalMessage === "string" ? o.originalMessage : typeof o.message === "string" ? o.message : null;
    out = {
      name: "NonError",
      message: (text ?? (typeof value === "string" ? value : safeString(value))).slice(0, MAX_CAUSE),
    };
  }
  const next = describeCause((value as { cause?: unknown }).cause, depth + 1);
  return next ? { ...out, cause: next } : out;
}

function safeString(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function redact(fields: Fields): Fields {
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields)) out[key] = SECRET_KEY.test(key) ? "[redacted]" : value;
  return out;
}

function log(level: LogLevel, event: string, fields: Fields = {}): void {
  const line = safeString({ level, event, time: new Date().toISOString(), ...redact(fields) });
  console.error(line);
}

/** An error that was handled (the request carried on) or that ended one. `event` is a stable snake_case name. */
export function logError(event: string, err: unknown, fields: Fields = {}): void {
  log("error", event, { ...fields, error: describeError(err) });
}

export function logWarn(event: string, fields: Fields = {}): void {
  log("warn", event, fields);
}

/** Cloudflare puts a unique id on every request (cf-ray); log it so one request can be followed across lines. */
export function requestIdFrom(headers?: Headers | null): string | undefined {
  return headers?.get("cf-ray") ?? undefined;
}
