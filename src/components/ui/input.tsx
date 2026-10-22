import * as React from "react"
import { cn } from "cn"

import { FIELD_CLASS } from "./field-style"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        FIELD_CLASS,
        "h-10 w-full min-w-0 px-3 py-1 text-base file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 max-md:h-11 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
