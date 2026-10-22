import * as React from "react";

import { cn } from "cn";

/**
 * A native drop-down that looks exactly like an `Input` (same height, border, corners, text size), so a form's fields
 * line up. Use it instead of a hand-styled `<select>` in forms.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-card px-2 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 max-md:h-10 md:text-sm dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
