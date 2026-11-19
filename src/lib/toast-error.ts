import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";

import { isNetworkError } from "@/lib/offline-queue";

/**
 * Shows a failed action as a toast: the error's own message (the server writes these in plain words), or `fallback`
 * when whatever was thrown is not an Error. Every form and button that saves something reports failures this way.
 */
export function toastError(err: unknown, fallback: string): void {
  if (isNetworkError(err)) return void toast.error("No connection. That needs you to be online.");
  toast.error(err instanceof Error ? err.message : fallback);
}

/**
 * Whether the server answered NOT_FOUND: the thing was deleted elsewhere (another tab or device). Callers then show
 * the message and refresh the list instead of putting the old row back (issue 458).
 */
export function isNotFound(err: unknown): boolean {
  return err instanceof TRPCClientError && err.data?.code === "NOT_FOUND";
}
