/** Most calls one HTTP request to /api/trpc may carry. Shared by the server (which enforces it) and the browser client. */
export const MAX_BATCH = 20;

/** How many procedure calls one /api/trpc request carries: a batch lists them as /api/trpc/a,b,c. */
export function callsInTrpcRequest(url: string): number {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return 1;
  }
  const names = decodeURIComponent(path.replace(/^\/api\/trpc\/?/, "")).split(",");
  return Math.min(MAX_BATCH, Math.max(1, names.filter(Boolean).length));
}
