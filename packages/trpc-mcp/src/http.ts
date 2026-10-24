import { type BaseContext, type McpServer, PARSE_ERROR } from "./protocol";

/**
 * Browsers send an Origin header; command-line MCP clients do not. A request from a web page on
 * another site is refused, so a page the user happens to visit cannot talk to the endpoint (a
 * stolen token is the only other way in). Requests with no Origin pass.
 */
export function originAllowed(origin: string | null, host: string | null, appUrl?: string): boolean {
  if (!origin) return true;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (host && o.host === host) return true;
  if (appUrl) {
    try {
      return new URL(appUrl).host === o.host;
    } catch {
      return false;
    }
  }
  return false;
}

export const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

/** The answer of `authenticate`: a context for the request, or a refusal with its status and headers. */
export type AuthOutcome<Ctx> =
  | { ok: true; ctx: Ctx }
  | { ok: false; status: number; message: string; headers?: Record<string, string> };

export type McpHttpOptions<Ctx extends BaseContext> = {
  /** The server from `createMcpServer` (or anything with its `handle` and `maxBatch`). */
  server: Pick<McpServer<Ctx>, "handle" | "maxBatch">;
  /** Checks the Authorization header (a token, an OAuth access token...). Runs before the body is read. */
  authenticate: (req: Request) => Promise<AuthOutcome<Ctx>>;
  /**
   * Counts `cost` calls (one per message in a batch, so a batch cannot multiply a limit) and says
   * whether they may go ahead. Leave it out only behind another limiter.
   */
  rateLimit?: (ctx: Ctx, cost: number) => Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }>;
  /** The app's own address: a browser Origin on that host is allowed besides the request's own host. */
  appUrl?: string;
  /** Default 256 KB. */
  maxBodyBytes?: number;
};

/** The whole HTTP behaviour of a stateless MCP endpoint: POST only, Origin check, auth, size cap, rate limit. */
export function createMcpHttpHandler<Ctx extends BaseContext>(o: McpHttpOptions<Ctx>) {
  const maxBody = o.maxBodyBytes ?? 256 * 1024;
  return async function handleHttp(req: Request): Promise<Response> {
    if (req.method !== "POST") {
      // No server-sent-event stream and no sessions to delete: this server only answers POSTs.
      return jsonResponse(405, { error: "Use POST." }, { allow: "POST" });
    }
    if (!originAllowed(req.headers.get("origin"), req.headers.get("host"), o.appUrl)) {
      return jsonResponse(403, { error: "Origin not allowed." });
    }
    const auth = await o.authenticate(req);
    if (!auth.ok) return jsonResponse(auth.status, { error: auth.message }, auth.headers);

    // Refuse an oversized body from its declared length before reading any of it.
    if (Number(req.headers.get("content-length") ?? 0) > maxBody)
      return jsonResponse(413, { error: "Request too large." });
    const text = await req.text();
    if (text.length > maxBody) return jsonResponse(413, { error: "Request too large." });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return jsonResponse(400, PARSE_ERROR);
    }

    if (o.rateLimit) {
      const cost = Array.isArray(body) ? Math.min(Math.max(body.length, 1), o.server.maxBatch + 1) : 1;
      const rate = await o.rateLimit(auth.ctx, cost);
      if (!rate.allowed) {
        return jsonResponse(
          429,
          { error: "Too many requests. Slow down a little." },
          { "retry-after": String(rate.retryAfterSeconds) },
        );
      }
    }

    const reply = await o.server.handle(body, auth.ctx);
    return reply.body === undefined
      ? new Response(null, { status: reply.status })
      : jsonResponse(reply.status, reply.body);
  };
}
