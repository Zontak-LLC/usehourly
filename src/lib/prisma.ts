import type { PrismaClient } from "@prisma/client";

let cached: Promise<PrismaClient> | undefined;

/**
 * Lazily build a PrismaClient bound to the Worker's D1 binding.
 *
 * Deliberately NOT a top-level await: importing this module must not touch D1,
 * otherwise `next build` page-data workers each boot a local workerd against the
 * same SQLite file and fail with SQLITE_BUSY. The client is created on first
 * request and memoised for the life of the isolate.
 */
export function getPrisma(): Promise<PrismaClient> {
  cached ??= (async () => {
    const [{ PrismaClient }, { PrismaD1 }, { getCloudflareContext }] = await Promise.all([
      import("@prisma/client"),
      import("@prisma/adapter-d1"),
      import("@opennextjs/cloudflare"),
    ]);
    const { env } = await getCloudflareContext({ async: true });
    return new PrismaClient({ adapter: new PrismaD1((env as unknown as { DB: D1Database }).DB) });
  })().catch((err) => {
    cached = undefined; // allow a retry on the next request instead of caching the failure
    throw err;
  });
  return cached;
}
