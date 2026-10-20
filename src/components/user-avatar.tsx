import { cn } from "cn";

import { initialsOf } from "@/lib/initials";

/** The person's picture, or their initials on a quiet disc when they have not added one. */
export function UserAvatar({
  name,
  avatar,
  className,
}: {
  name: string | null | undefined;
  avatar?: string | null;
  className?: string;
}) {
  return avatar ? (
    // biome-ignore lint/performance/noImgElement: a small data: URL picture, nothing to optimize
    <img src={avatar} alt="" className={cn("size-8 shrink-0 rounded-full border object-cover", className)} />
  ) : (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted font-semibold text-foreground text-xs",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
