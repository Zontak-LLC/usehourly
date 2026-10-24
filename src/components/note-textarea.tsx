"use client";

import type * as React from "react";

import { cn } from "cn";
import { toast } from "sonner";

import { PolishButtons, usePolish } from "@/components/polish-action";
import { Textarea } from "@/components/ui/textarea";
import { fitPaste, NOTE_MAX, noteCounter } from "@/lib/notes";

type Props = Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange" | "maxLength"> & {
  value: string;
  onChange: (value: string) => void;
  /** Names sent with the note when the person polishes it with their own AI key (nothing shows without a key). */
  polish?: { project: string; client: string };
};

/**
 * The description box used everywhere a time entry's note is typed. It grows with the text (up
 * to a scrollable maximum), carries the Polish button inside its right edge when the person has an AI key (see
 * polish-action.tsx), shows a counter as the limit gets close, and — instead of letting the
 * browser silently chop a long paste — keeps what fits and says how much was left out.
 */
export function NoteTextarea({ value, onChange, className, onPaste, polish, ...rest }: Props) {
  const polisher = usePolish(value, onChange, polish);
  const counter = noteCounter(value.length);
  const atLimit = value.length >= NOTE_MAX;

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    onPaste?.(e);
    if (e.defaultPrevented) return;
    const el = e.currentTarget;
    const pasted = e.clipboardData.getData("text");
    const selected = el.selectionEnd - el.selectionStart;
    const { text, dropped } = fitPaste(value, selected, pasted);
    if (dropped === 0) return;
    e.preventDefault();
    onChange(value.slice(0, el.selectionStart) + text + value.slice(el.selectionEnd));
    toast.warning(
      `Descriptions can be ${NOTE_MAX.toLocaleString("en-US")} characters. The last ${dropped.toLocaleString("en-US")} of what you pasted were left out.`,
    );
  }

  return (
    <div className="space-y-1">
      {/* Polish sits inside the right edge of the box; the text keeps clear of it */}
      <div className="relative">
        <Textarea
          {...rest}
          clearable={!polisher.enabled}
          value={value}
          maxLength={NOTE_MAX}
          readOnly={polisher.busy || rest.readOnly}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          className={cn(
            "max-h-48 overflow-y-auto",
            polisher.enabled && "pr-32",
            polisher.pending && "border-primary/60 bg-primary/5",
            polisher.busy && "opacity-70",
            className,
          )}
        />
        <PolishButtons polish={polisher} />
      </div>
      {counter && (
        <p
          className={cn("text-right text-xs", atLimit ? "font-medium text-destructive" : "text-muted-foreground")}
          aria-live="polite"
        >
          {atLimit ? `${counter} · limit reached` : counter}
        </p>
      )}
    </div>
  );
}
