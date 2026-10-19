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
