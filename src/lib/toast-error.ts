import { toast } from "sonner";

/**
 * Shows a failed action as a toast: the error's own message (the server writes these in plain words), or `fallback`
 * when whatever was thrown is not an Error. Every form and button that saves something reports failures this way.
 */
export function toastError(err: unknown, fallback: string): void {
  toast.error(err instanceof Error ? err.message : fallback);
}
