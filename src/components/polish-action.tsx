"use client";

import { useEffect, useRef, useState } from "react";

import { Check, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAiSetup } from "@/components/use-ai-key";
import { AiError, polishNote } from "@/lib/ai-polish";

type Polished = { original: string; polished: string };

/**
 * "Polish" for a description box, only for a person who has saved their own AI key (Account, AI assistants). Pressing
 * it sends the note and the project and client names to the AI service from this browser and FILLS THE BOX with the
 * result, so the person sees it in place. They then keep it or undo it; typing anything also keeps it (the text no
 * longer matches the suggestion, so the choice goes away). Nothing is saved until the entry itself is.
 */
export function usePolish(
  value: string,
  onChange: (text: string) => void,
  context: { project: string; client: string } | undefined,
) {
  const { setup } = useAiSetup();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Polished | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  /** The suggestion currently in the box and waiting for a yes or no. */
  const pending = last !== null && last.polished === value ? last : null;

  async function run() {
    if (!setup || !context) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setLast(null);
    try {
      const polished = await polishNote(fetch.bind(globalThis), setup, { note: value, ...context }, controller.signal);
      if (polished === value) return void toast.info("That already reads well. Nothing to change.");
      setLast({ original: value, polished });
      onChange(polished);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(err instanceof AiError ? err.message : "Couldn't polish that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return {
    enabled: Boolean(setup && context),
    busy,
    pending,
    canRun: value.trim() !== "",
    run,
    keep: () => setLast(null),
    undo: () => {
      if (pending) onChange(pending.original);
      setLast(null);
    },
  };
}

/** Inside the right edge of the box: the Polish button, or two small floating yes/no buttons once it holds a suggestion. */
export function PolishButtons({ polish }: { polish: ReturnType<typeof usePolish> }) {
  if (!polish.enabled) return null;
  return (
    <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
      {polish.pending ? (
        // Two small floating buttons at the far right of the box: yes (keep) and no (undo)
        <>
          <button
            type="button"
            onClick={polish.undo}
            aria-label="Undo"
            title="No: put your own text back"
            className="grid size-7 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <X className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={polish.keep}
            aria-label="Keep"
            title="Yes: keep the polished text"
            className="grid size-7 place-items-center rounded-full border bg-card shadow-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <Check className="size-4" aria-hidden />
          </button>
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={polish.run}
          disabled={polish.busy || !polish.canRun}
          title="Tidy this description with your own AI key"
        >
          <Sparkles aria-hidden /> {polish.busy ? "Polishing…" : "Polish"}
        </Button>
      )}
      <span role="status" className="sr-only">
        {polish.pending ? "Polished. Keep it or undo." : ""}
      </span>
    </div>
  );
}
