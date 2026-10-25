import type { PrismaClient } from "@prisma/client";

import { logError } from "@/lib/log";

/**
 * One client per REQUEST, never one per isolate (issue 315).
 *
 * A Worker isolate serves many requests at once, and a promise created in one request and settled by another
 * request's I/O hangs: if the request that did the I/O ends or is canceled first (a person clicks on before a page
 * has loaded), the waiting request can never wake up and the runtime kills it ("Worker's code had hung", Error
 * 1101). A shared PrismaClient does exactly that: its DataLoader merges every findUnique made in the same tick, by
 * ANY caller, into one `IN (...)` query sent from whichever request got there first. Under load that ended about
 * one request in 3,000 as a 500. So each request gets its own client, keyed by the request's Cloudflare context
 * (OpenNext makes a fresh `{ env, ctx, cf }` object per request), and calls inside one request share it.
 * The WeakMap lets a finished request's client be garbage collected.
 */
const clients = new WeakMap<object, Promise<PrismaClient>>();

/**
 * Lazily build a PrismaClient bound to the Worker's D1 binding.
 *
 * Deliberately NOT a top-level await: importing this module must not touch D1, otherwise `next build` page-data
 * workers each boot a local workerd against the same SQLite file and fail with SQLITE_BUSY.
 */
export async function getPrisma(): Promise<PrismaClient> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const context = await getCloudflareContext({ async: true });
  let client = clients.get(context);
  if (!client) {
    client = build(context.env);
    clients.set(context, client);
    // a failure is not kept: the next call in the same request tries again
    client.catch(() => clients.delete(context));
  }
  return client;
}

async function build(env: unknown): Promise<PrismaClient> {
  const [{ PrismaClient }, { PrismaD1 }] = await Promise.all([import("@prisma/client"), import("@prisma/adapter-d1")]);
  // PRISMA_QUERY_LOG=1 (local diagnosis only, never set in production) writes one line per query with its duration.
  const logQueries = process.env.PRISMA_QUERY_LOG === "1";
  const built = new PrismaClient({
    // check-rules-ok: the Cloudflare env type does not declare the D1 binding name
    adapter: new PrismaD1((env as unknown as { DB: D1Database }).DB),
    ...(logQueries ? { log: [{ emit: "event" as const, level: "query" as const }] } : {}),
  });
  if (logQueries) {
    // biome-ignore lint/suspicious/noExplicitAny: the event type is only declared for a client built with log options
    (built as any).$on("query", (e: { query: string; duration: number }) =>
      console.error(`QRY ${e.duration}ms ${e.query.replace(/\s+/g, " ").slice(0, 140)}`),
    );
  }
  // Prisma sets itself up on the first query; do it here so a failure is logged once with a clear name.
  try {
    await built.$connect();
  } catch (err) {
    logError("prisma_warmup_failed", err); // it will connect on the first query
  }
  return built;
}
