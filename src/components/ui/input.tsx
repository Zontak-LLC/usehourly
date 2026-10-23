"use client"

import * as React from "react"
import { cn } from "cn"

import { ClearFieldButton, useClearable } from "./clear-field"
import { FIELD_CLASS } from "./field-style"

const INPUT_CLASS =
  "h-10 w-full min-w-0 px-3 py-1 text-base file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 max-md:h-11 md:text-sm"

type InputProps = React.ComponentProps<"input"> & {
  /**
   * Shows a round × inside the right edge while the box holds text; it empties the box (firing `onChange`) and
   * keeps the focus there. Turn it on for names, addresses, notes, search boxes and rates; leave it off for passwords,
   * date and time pickers and file pickers (issue 220).
   */
  clearable?: boolean
  /** Classes for the box that wraps a clearable input (put layout such as `flex-1` or a width here). */
  wrapperClassName?: string
}

function Input({ clearable, wrapperClassName, ...props }: InputProps) {
  return clearable ? <ClearableInput wrapperClassName={wrapperClassName} {...props} /> : <PlainInput {...props} />
}

function PlainInput({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(FIELD_CLASS, INPUT_CLASS, className)} {...props} />
}

function ClearableInput({
  className,
  wrapperClassName,
  type,
  ref,
  onInput,
  ...props
}: React.ComponentProps<"input"> & { wrapperClassName?: string }) {
  const field = useClearable<HTMLInputElement>(props.value, ref)
  const shown = field.filled && !props.disabled && !props.readOnly
  return (
    <div data-slot="clearable" className={cn("relative min-w-0", wrapperClassName)}>
      <input
        type={type}
        data-slot="input"
        ref={field.ref}
        onInput={(e) => {
          field.onInput(e)
          onInput?.(e)
        }}
        className={cn(FIELD_CLASS, INPUT_CLASS, className, "pr-10 [&::-webkit-search-cancel-button]:hidden")}
        {...props}
      />
      {shown && <ClearFieldButton onClear={field.clear} className="inset-y-0 my-auto" />}
    </div>
  )
}

export { Input }
