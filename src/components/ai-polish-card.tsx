"use client";

import { useState } from "react";

import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAiKey } from "@/components/use-ai-key";
import { isAnthropicKey } from "@/lib/ai-key";
import { AiError, testKey } from "@/lib/ai-polish";

/**
 * Account > AI assistants > "Polish descriptions": the person's own Anthropic API key, kept in this browser only. With a
 * key saved, a Polish button appears under description boxes. A chat plan (Claude Pro or Max) cannot be used: the API
 * is billed separately, from the Anthropic console.
 */
export function AiPolishCard() {
  const { key, save, clear } = useAiKey();
  const [draft, setDraft] = useState("");
  const [testing, setTesting] = useState(false);

  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!isAnthropicKey(value)) {
      toast.error("That doesn't look like an Anthropic API key. It starts with sk-ant-.");
      return;
    }
    setTesting(true);
    try {
      await testKey(fetch.bind(globalThis), value);
    } catch (err) {
      toast.error(err instanceof AiError ? err.message : "Couldn't check that key. Try again.");
      return;
    } finally {
      setTesting(false);
    }
    if (!save(value)) {
      toast.error("This browser wouldn't let us keep the key. Check that it allows site storage.");
      return;
    }
    setDraft("");
    toast.success("Key saved on this device. Polish now appears under descriptions.");
  }

  return (
    <SectionCard
      title="Polish descriptions with your own AI key"
      description="Type a rough note and press Polish for a cleaner line. You use your own Anthropic key, so it costs you a fraction of a cent each time and nothing here."
      onSubmit={saveKey}
    >
      {key ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            A key is saved on this device (…{key.slice(-4)}). Polish shows under description boxes.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              clear();
              toast.success("Key removed from this device.");
            }}
          >
            Remove key
          </Button>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="ai-key">Anthropic API key</Label>
          <div className="flex max-w-xl flex-wrap gap-2">
            <Input
              id="ai-key"
              name="ai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={testing || draft.trim() === ""}>
              {testing ? "Checking…" : "Check and save"}
            </Button>
          </div>
        </div>
      )}
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-xs">
        <li>
          The key stays in this browser. It is never sent to UseHourly: your browser talks to Anthropic directly. It is
          forgotten when you sign out.
        </li>
        <li>Only the description and the project and client names are sent. Never rates, amounts or other entries.</li>
        <li>
          This needs an API key from the Anthropic console, which is billed separately. A Claude Pro or Max plan can't
          be used.
        </li>
        <li>A suggestion is only a suggestion: nothing changes until you press Use this.</li>
      </ul>
    </SectionCard>
  );
}
