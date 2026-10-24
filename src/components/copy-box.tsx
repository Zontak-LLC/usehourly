"use client";

import { useState } from "react";

import { cn } from "cn";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

/**
 * A block of text (a token, a command, a config file) with its Copy button INSIDE the box, in the top right corner
 * (2026-10-24, the owner: the button sat above the box, apart from what it copies). After a copy the button says
 * "Copied" and the box's edge turns the accent for a moment, so it is clear WHAT was copied.
 */
export function CopyBox({ label, text }: { label?: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5">
      {label && <span className="font-medium text-sm">{label}</span>}
      <div
        className={cn(
          "relative rounded-xl bg-muted ring-1 ring-foreground/10 transition-shadow duration-300",
          copied && "ring-2 ring-amber",
        )}
      >
        <pre className="min-h-11 overflow-x-auto whitespace-pre-wrap break-all py-3 pr-24 pl-3 font-mono text-xs">
          {text}
        </pre>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              toast.error("Couldn't copy. Select the text and copy it by hand.");
            }
          }}
          className={cn(
            "absolute top-1.5 right-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 font-medium text-xs shadow-xs ring-1 ring-foreground/10 transition-colors",
            copied ? "bg-amber text-white dark:text-background" : "bg-card text-foreground hover:bg-background",
          )}
        >
          {copied ? <Check className="size-3.5 text-current" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
