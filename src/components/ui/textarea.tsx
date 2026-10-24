"use client"

import * as React from "react"
import { cn } from "cn"

import { ClearFieldButton, useClearable } from "./clear-field"
import { FIELD_CLASS } from "./field-style"

const TEXTAREA_CLASS =
  "flex field-sizing-content min-h-16 w-full px-3 py-2 text-base placeholder:text-muted-foreground/80 md:text-sm"

type TextareaProps = React.ComponentProps<"textarea"> & {
  /** A round × in the top right corner while the box holds text (see `Input`'s `clearable`, issue 220). */
  clearable?: boolean
}

function Textarea({ clearable, ...props }: TextareaProps) {
  return clearable ? <ClearableTextarea {...props} /> : <PlainTextarea {...props} />
}

function PlainTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(FIELD_CLASS, TEXTAREA_CLASS, className)} {...props} />
}

function ClearableTextarea({ className, ref, onInput, ...props }: React.ComponentProps<"textarea">) {
  const field = useClearable<HTMLTextAreaElement>(
    props.value === undefined ? undefined : String(props.value),
    ref,
  )
  const shown = field.filled && !props.disabled && !props.readOnly
  return (
    <div data-slot="clearable" className="relative min-w-0">
      <textarea
        data-slot="textarea"
        ref={field.ref}
        onInput={(e) => {
          field.onInput(e)
          onInput?.(e)
        }}
        className={cn(FIELD_CLASS, TEXTAREA_CLASS, className, "pr-10")}
        {...props}
      />
      {shown && <ClearFieldButton onClear={field.clear} className="top-1" />}
    </div>
  )
}

export { Textarea }
