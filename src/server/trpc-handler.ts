import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { MAX_BATCH } from "@/lib/trpc-limits";

import { appRouter } from "./routers/_app";
import type { Context } from "./trpc";

/** The HTTP behaviour of /api/trpc, apart from Next so tests can drive it. */
export const handleTrpc = (req: Request, createContext: () => Promise<Context> | Context) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
    // One request may carry only a few calls: otherwise a single request could fan out into thousands.
    maxBatchSize: MAX_BATCH,
    onError: ({ error, path }) => {
      if (error.code === "INTERNAL_SERVER_ERROR") console.error(`tRPC ${path}:`, error);
    },
  });
