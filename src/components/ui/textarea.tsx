import type * as React from "react"
import { cn } from "cn"

import { FIELD_CLASS } from "./field-style"

const TEXTAREA_CLASS =
  "flex field-sizing-content min-h-16 w-full px-3 py-2 text-base placeholder:text-muted-foreground/80 md:text-sm"

/** A plain text area (no clear button, 2026-10-24). */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(FIELD_CLASS, TEXTAREA_CLASS, className)} {...props} />
}

export { Textarea }
