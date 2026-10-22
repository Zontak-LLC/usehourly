"use client";

import { useState } from "react";

import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** A block of text (a token, a command, a config file) with a Copy button that says "Copied" for a moment. */
export function CopyBox({ label, text }: { label?: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        {label ? <span className="font-medium text-sm">{label}</span> : <span />}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              toast.error("Couldn't copy. Select the text and copy it by hand.");
            }
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-muted p-3 font-mono text-xs ring-1 ring-foreground/10">
        {text}
      </pre>
    </div>
  );
}
