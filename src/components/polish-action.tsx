"use client";

import { useEffect, useRef, useState } from "react";

import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAiKey } from "@/components/use-ai-key";
import { AiError, polishNote } from "@/lib/ai-polish";

/**
 * "Polish" under a description box, only for a person who has saved their own Anthropic key (Account, AI assistants).
 * It sends the note and the project and client names to Anthropic from this browser, shows the suggestion, and changes
 * nothing until "Use this" is pressed.
 */
export function PolishAction({
  value,
  onUse,
  context,
}: {
  value: string;
  onUse: (text: string) => void;
  context: { project: string; client: string };
}) {
  const { key } = useAiKey();
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  if (!key) return null;

  async function run() {
    if (!key) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setSuggestion(null);
    try {
      setSuggestion(await polishNote(fetch.bind(globalThis), key, { note: value, ...context }, controller.signal));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(err instanceof AiError ? err.message : "Couldn't polish that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={busy || value.trim() === ""}>
        <Sparkles aria-hidden /> {busy ? "Polishing…" : "Polish"}
      </Button>
      {suggestion !== null && (
        <div role="status" className="space-y-2 rounded-lg bg-muted/60 p-3 text-sm">
          <p className="text-muted-foreground text-xs">Suggestion</p>
          <p data-testid="polish-suggestion">{suggestion}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onUse(suggestion);
                setSuggestion(null);
              }}
            >
              Use this
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
