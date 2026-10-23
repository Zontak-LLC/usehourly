import { QUERY_CACHE_KEY } from "@/lib/offline-cache";

/**
 * What this browser remembers about the sample data: the saved copy of the everyday queries and the projects the add
 * form starts on (last used, recent, pinned). They all point at sample projects that "Start fresh" deletes.
 */
export const SAMPLE_COPIES = [
  QUERY_CACHE_KEY,
  "hourly:lastProject",
  "hourly:recentProjects",
  "hourly:pinnedProjects",
] as const;

/**
 * Forgets what the browser kept of the demo after it is claimed (issue 217: with "Start fresh" the sample entries stayed
 * on screen until a reload). Only remembered project choices are dropped when the work is kept, since its projects stay.
 */
export function forgetSampleCopies(storage: Pick<Storage, "removeItem"> | null, startFresh: boolean): void {
  if (!storage) return;
  for (const key of startFresh ? SAMPLE_COPIES : [QUERY_CACHE_KEY]) {
    try {
      storage.removeItem(key);
    } catch {
      // storage blocked: nothing was kept anyway
    }
  }
}
