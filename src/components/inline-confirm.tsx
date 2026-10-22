"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * "Are you sure?" inside the card it is about, not a pop-up (docs/ui-spec.md, "Feedback and states"). It names what will
 * go, puts the safe choice first and focuses it, and the destructive button says what it does ("Delete entry"). The
 * caller shows it only while the question is open and closes it from `onCancel` or after `onConfirm`.
 */
export function InlineConfirm({
  title,
  confirmLabel,
  confirmIcon,
  pending = false,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 bg-destructive/5 px-3 py-3 sm:px-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div>
        <p className="font-semibold text-sm">{title}</p>
        {children && <div className="mt-1 text-foreground/75 text-sm">{children}</div>}
      </div>
      <div className="flex justify-end gap-2 max-sm:flex-col-reverse">
        <Button type="button" variant="outline" className="h-11 sm:h-10" onClick={onCancel} autoFocus>
          Cancel
        </Button>
        <Button type="button" variant="destructive" className="h-11 sm:h-10" disabled={pending} onClick={onConfirm}>
          {confirmIcon} {pending ? "Working…" : confirmLabel}
        </Button>
      </div>
    </section>
  );
}
