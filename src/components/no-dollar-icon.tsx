import { cn } from "cn";

/**
 * "Not billable": a dollar sign with a red slash through it (a circle with a bar says "forbidden", not "no money").
 * Drawn like the lucide icons (24 grid, 2px round strokes) so it sits with them; it takes its size from `className`.
 */
export function NoDollar({ className }: { className?: string }) {
  return (
    <svg
      data-icon="no-dollar"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
    >
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      <line x1="3" x2="21" y1="3" y2="21" className="stroke-rose-600 dark:stroke-rose-400" strokeWidth="2.5" />
    </svg>
  );
}
