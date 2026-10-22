import * as React from "react"
import { cn } from "cn"

import { FIELD_CLASS } from "./field-style"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        FIELD_CLASS,
        "flex field-sizing-content min-h-16 w-full px-3 py-2 text-base placeholder:text-muted-foreground/80 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
