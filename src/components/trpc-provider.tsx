"use client";

import { useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";

import { trpc } from "@/lib/trpc";
import { MAX_BATCH } from "@/lib/trpc-limits";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // A minute: switching between pages (the tabs, the swipe) shows what was just loaded at once instead of asking
          // the server again for the same lists. Anything this person changes is refreshed immediately by its mutation.
          queries: { staleTime: 60_000, retry: 1 },
          // Without a connection an action should fail at once with a clear message, not wait silently and run later.
          mutations: { networkMode: "always" },
        },
      }),
  );
  const [client] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          maxItems: MAX_BATCH,
          // Saving an entry gives up after 20 seconds so a dead connection does not leave the form hanging; the entry is
          // then kept on the device and retried (its own id makes the retry safe).
          fetch: (url, options) =>
            fetch(
              url,
              String(url).includes("entry.create") ? { ...options, signal: AbortSignal.timeout(20_000) } : options,
            ),
        }),
      ],
    }),
  );
  return (
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
