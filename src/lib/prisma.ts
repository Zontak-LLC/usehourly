import type { PrismaClient } from "@prisma/client";

import { logError } from "@/lib/log";

let client: PrismaClient | undefined;

/**
 * Lazily build a PrismaClient bound to the Worker's D1 binding.
 *
 * Deliberately NOT a top-level await: importing this module must not touch D1,
 * otherwise `next build` page-data workers each boot a local workerd against the
 * same SQLite file and fail with SQLITE_BUSY. The client is created on first
 * request and memoised for the life of the isolate.
 *
 * Only the FINISHED client is memoised, never a pending promise. A promise created in one request
 * and awaited in another hangs the second request if the first one ends before it settles; the
 * runtime then kills it ("Worker's code had hung", Cloudflare Error 1101). That happened when an
 * assistant fired several tool calls at once at a freshly started Worker. So every request that
 * finds no client builds (and warms) its own inside its own request context, and the first one
 * to finish is kept. The duplicate work only happens on a cold start.
 */
export async function getPrisma(): Promise<PrismaClient> {
  if (client) return client;
  const [{ PrismaClient }, { PrismaD1 }, { getCloudflareContext }] = await Promise.all([
    import("@prisma/client"),
    import("@prisma/adapter-d1"),
    import("@opennextjs/cloudflare"),
  ]);
  const { env } = await getCloudflareContext({ async: true });
  // check-rules-ok: the Cloudflare env type does not declare the D1 binding name
  const built = new PrismaClient({ adapter: new PrismaD1((env as unknown as { DB: D1Database }).DB) });
  // Prisma sets itself up on the first query and keeps that work in a promise of its own. Do it here, in
  // the request that made the client, so no later request waits on a promise another request started.
  try {
    await built.$connect();
  } catch (err) {
    logError("prisma_warmup_failed", err); // it will connect on the first query
  }
  client ??= built;
  return client;
}
