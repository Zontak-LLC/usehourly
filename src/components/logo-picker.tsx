"use client";

import { useRef } from "react";

import { ImagePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Preview tile with Upload / Change and Remove buttons (a bare file input is ugly and says "No file chosen"). */
export function LogoPicker({
  value,
  onPick,
  onRemove,
  name,
  compact = false,
  addLabel = "Add logo",
}: {
  value: string | null | undefined;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  /** What it is, for the buttons' names ("client logo"). */
  name: string;
  compact?: boolean;
  /** The button's words when nothing is chosen yet (default "Add logo"). */
  addLabel?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg border bg-white ${compact ? "size-10" : "h-16 w-28"}`}
      >
        {value ? (
          // biome-ignore lint/performance/noImgElement: a data: URL preview, nothing to optimize
          <img src={value} alt={`${name} preview`} className="max-h-full max-w-full object-contain" />
        ) : (
          <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Choose ${name} file`}
        onChange={onPick}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
        {value ? "Change" : addLabel}
      </Button>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
        >
          <Trash2 /> Remove
        </Button>
      )}
    </div>
  );
}
