"use client";

import type * as React from "react";

import { cn } from "cn";
import { toast } from "sonner";

import { PolishAction } from "@/components/polish-action";
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
 * to a scrollable maximum), shows a counter as the limit gets close, and — instead of letting the
 * browser silently chop a long paste — keeps what fits and says how much was left out.
 */
export function NoteTextarea({ value, onChange, className, onPaste, polish, ...rest }: Props) {
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
      <Textarea
        {...rest}
        value={value}
        maxLength={NOTE_MAX}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        className={cn("max-h-48 overflow-y-auto", className)}
      />
      {counter && (
        <p
          className={cn("text-right text-xs", atLimit ? "font-medium text-destructive" : "text-muted-foreground")}
          aria-live="polite"
        >
          {atLimit ? `${counter} · limit reached` : counter}
        </p>
      )}
      {polish && <PolishAction value={value} onUse={onChange} context={polish} />}
    </div>
  );
}
