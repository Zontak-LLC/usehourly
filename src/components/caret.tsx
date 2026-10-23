import { ChevronDown } from "lucide-react";

/**
 * The drop-down arrow for menus, filters and folding sections: a plain chevron in the text colour (no chip behind it).
 * It turns upside down when the thing it sits on is open: put `group` on the trigger and Radix's `data-state="open"` does
 * the rest, or pass `open` for something the page tracks itself.
 */
export function Caret({ open, className = "" }: { open?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-grid size-6 shrink-0 place-items-center text-foreground/85 transition-transform duration-300 group-data-[state=open]:rotate-180 ${open ? "rotate-180" : ""} ${className}`}
    >
      <ChevronDown className="size-5" strokeWidth={2.25} />
    </span>
  );
}
