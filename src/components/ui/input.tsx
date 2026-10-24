import type * as React from "react"
import { cn } from "cn"

import { FIELD_CLASS } from "./field-style"

const INPUT_CLASS =
  "h-10 w-full min-w-0 px-3 py-1 text-base file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 max-md:h-11 md:text-sm"

/** A plain text box. (2026-10-24, the owner: no round × to clear a box anywhere; issue 220's clear button was removed.) */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(FIELD_CLASS, INPUT_CLASS, className)} {...props} />
}

export { Input }
