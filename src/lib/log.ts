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

export function describeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack?.slice(0, MAX_STACK) };
  }
  return { name: "NonError", message: typeof err === "string" ? err : safeString(err) };
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

export function log(level: LogLevel, event: string, fields: Fields = {}): void {
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
