import * as React from "react";

import { cn } from "cn";

import { FIELD_CLASS } from "./field-style";

/**
 * A native drop-down that looks exactly like an `Input` (same height, field style, corners, text size), with its own chevron, so a form's fields
 * line up. Use it instead of a hand-styled `<select>` in forms.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        FIELD_CLASS,
        "field-chevron h-10 w-full min-w-0 cursor-pointer appearance-none pr-9 pl-3 text-base max-md:h-11 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
