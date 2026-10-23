"use client";

import { useRef, useState } from "react";

import { ImageIcon, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

const ACCEPT = "image/png,image/jpeg,image/webp";

/** A light checkerboard, the way design tools show an image: it reveals the logo's edges and see-through parts. */
const CHECKER = {
  backgroundColor: "white",
  backgroundImage: "conic-gradient(rgb(0 0 0 / 0.06) 25%, transparent 0 50%, rgb(0 0 0 / 0.06) 0 75%, transparent 0)",
  backgroundSize: "12px 12px",
};

/**
 * The one way to manage a logo or picture (2026-10-23), after the familiar pattern of Stripe, Linear and Slack: one row
 * with the image on a checkerboard, a short line, and two plain buttons, Replace and Remove (with no image: Upload).
 * A file dropped anywhere on the row is used too. Used for client, project and business logos and the profile picture.
 */
export function LogoPicker({
  value,
  onPick,
  onRemove,
  name,
  compact = false,
  addLabel = "Upload logo",
  hint,
}: {
  value: string | null | undefined;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  /** What it is, for the buttons' names ("client logo"). */
  name: string;
  /** A smaller preview, for tight spots. */
  compact?: boolean;
  /** The upload button's words (default "Upload logo"). */
  addLabel?: string;
  /** One short line under it: where the image is used ("Printed on your invoices"). */
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const choose = () => input.current?.click();

  // A dropped file goes through the same file input, so every caller's onPick handles it with no extra code.
  function drop(e: React.DragEvent) {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !input.current || !ACCEPT.split(",").includes(file.type)) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.current.files = dt.files;
    input.current.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label={`Choose ${name} file`}
        onChange={onPick}
      />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop area only; the buttons inside do the work */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={`flex w-full max-w-md flex-wrap items-center gap-3 rounded-xl p-2 transition-colors ${
          over
            ? "bg-amber/10 ring-2 ring-amber"
            : value
              ? "bg-muted/40 ring-1 ring-foreground/10"
              : "border border-foreground/25 border-dashed"
        }`}
      >
        <div
          className={`grid shrink-0 place-items-center overflow-hidden rounded-lg ring-1 ring-foreground/10 dark:brightness-[0.88] ${
            compact ? "h-10 w-16" : "h-14 w-24"
          }`}
          style={value ? CHECKER : undefined}
        >
          {value ? (
            // biome-ignore lint/performance/noImgElement: a data: URL preview, nothing to optimize
            <img src={value} alt={`${name} preview`} className="max-h-[85%] max-w-[85%] object-contain" />
          ) : (
            <ImageIcon className="size-5 text-foreground/40" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">{value ? "Your logo" : "No logo yet"}</p>
          <p className="text-foreground/60 text-xs" title="You can also drop a file here">
            PNG or JPG
          </p>
        </div>
        <div className="flex gap-1.5">
          {value ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={choose} aria-label={`Replace ${name}`}>
                Replace
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRemove}
                aria-label={`Remove ${name}`}
                className="text-foreground/70 hover:text-destructive"
              >
                <Trash2 /> Remove
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={choose} aria-label={`${addLabel} (${name})`}>
              <Upload /> {addLabel}
            </Button>
          )}
        </div>
      </div>
      {hint && <p className="text-foreground/60 text-xs">{hint}</p>}
    </div>
  );
}
