"use client";

import { useState } from "react";

import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAiSetup } from "@/components/use-ai-key";
import { AiError, testKey } from "@/lib/ai-polish";
import { defaultModel, detectProvider, isModelId, PROVIDER_IDS, PROVIDERS, type ProviderId } from "@/lib/ai-provider";

const selectClass = "h-10 w-full max-w-xl rounded-lg border border-input bg-card px-2 text-sm dark:bg-input/30";
const CUSTOM = "__custom";

/** A model choice: one of the service's cheap presets, or "Other" with a model name typed in. */
function ModelPicker({
  provider,
  value,
  onChange,
  id,
  live = true,
  disabled = false,
}: {
  provider: ProviderId;
  value: string;
  onChange: (model: string) => void;
  id: string;
  /** True: a typed name is passed on as it is typed. False: only when the box is left or Enter is pressed (each pass costs a check). */
  live?: boolean;
  disabled?: boolean;
}) {
  const presets = PROVIDERS[provider].models;
  const isPreset = presets.some((m) => m.id === value);
  const [custom, setCustom] = useState(!isPreset);
  const [text, setText] = useState(isPreset ? "" : value);
  return (
    <div className="grid gap-1.5">
      <select
        id={id}
        className={selectClass}
        value={custom ? CUSTOM : value}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(e.target.value);
        }}
      >
        {presets.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
        <option value={CUSTOM}>Other model…</option>
      </select>
      {custom && (
        <Input
          aria-label="Model name"
          value={text}
          placeholder="Model name, as the service lists it"
          autoComplete="off"
          spellCheck={false}
          className="max-w-xl"
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            if (live) onChange(e.target.value.trim());
          }}
          onBlur={() => {
            if (!live && text.trim() !== value) onChange(text.trim());
          }}
          onKeyDown={(e) => {
            if (!live && e.key === "Enter") {
              e.preventDefault();
              if (text.trim() !== value) onChange(text.trim());
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * Account > AI assistants > "Polish descriptions": the person's own Anthropic or OpenAI key and model, kept in this
 * browser only. With a key saved, a Polish button appears under description boxes. A chat plan (Claude Pro or Max,
 * ChatGPT Plus) cannot be used: API keys are billed separately, from the service's own console.
 */
export function AiPolishCard() {
  const { setup, save, clear } = useAiSetup();
  const [provider, setProvider] = useState<ProviderId>("anthropic");
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(defaultModel("anthropic"));
  const [testing, setTesting] = useState(false);
  const info = PROVIDERS[provider];

  /** Switches the saved key to another model, but only after one tiny call proves that model works for this key. */
  async function changeModel(next: string) {
    if (!setup) return;
    if (!isModelId(next)) {
      toast.error("That isn't a model name. Use letters, digits and - . _ : / only.");
      return;
    }
    const candidate = { ...setup, model: next };
    setTesting(true);
    try {
      await testKey(fetch.bind(globalThis), candidate);
    } catch (err) {
      toast.error(err instanceof AiError ? err.message : "Couldn't check that model. Try again.");
      return;
    } finally {
      setTesting(false);
    }
    if (!save(candidate)) {
      toast.error("This browser wouldn't let us keep that. Check that it allows site storage.");
      return;
    }
    toast.success(`Checked: Polish now uses ${next}.`);
  }

  function chooseProvider(next: ProviderId) {
    setProvider(next);
    setModel(defaultModel(next));
  }

  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (detectProvider(value) !== provider) {
      toast.error(`That doesn't look like an ${info.label.split(" ")[0]} API key. It starts with ${info.keyHint}`);
      return;
    }
    if (!isModelId(model)) {
      toast.error("Choose a model, or type its name.");
      return;
    }
    const candidate = { provider, key: value, model };
    setTesting(true);
    try {
      await testKey(fetch.bind(globalThis), candidate);
    } catch (err) {
      toast.error(err instanceof AiError ? err.message : "Couldn't check that key. Try again.");
      return;
    } finally {
      setTesting(false);
    }
    if (!save(candidate)) {
      toast.error("This browser wouldn't let us keep the key. Check that it allows site storage.");
      return;
    }
    setDraft("");
    toast.success("Key saved on this device. Polish now appears under descriptions.");
  }

  const saved = setup ? PROVIDERS[setup.provider] : null;
  return (
    <SectionCard
      title="Polish descriptions with your own AI key"
      description="Type a rough note and press Polish for a cleaner line. You use your own Anthropic (Claude) or OpenAI (ChatGPT) key, so it costs you a fraction of a cent each time and nothing here."
      onSubmit={saveKey}
    >
      {setup && saved ? (
        <div className="grid gap-3">
          <p className="text-sm">
            Using {saved.label} with a key saved on this device (…{setup.key.slice(-4)}). Polish shows under description
            boxes.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="ai-model-saved">Model</Label>
            <ModelPicker
              id="ai-model-saved"
              provider={setup.provider}
              value={setup.model}
              live={false}
              disabled={testing}
              onChange={(next) => void changeModel(next)}
            />
            <p className="text-muted-foreground text-xs">
              The first choice is the cheapest. It is plenty for tidying a sentence.
            </p>
          </div>
          <div>
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
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ai-provider">AI service</Label>
            <select
              id="ai-provider"
              className={selectClass}
              value={provider}
              onChange={(e) => chooseProvider(e.target.value as ProviderId)}
            >
              {PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>
                  {PROVIDERS[id].label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ai-model">Model</Label>
            <ModelPicker key={provider} id="ai-model" provider={provider} value={model} onChange={setModel} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ai-key">API key</Label>
            <div className="flex max-w-xl flex-wrap gap-2">
              <Input
                id="ai-key"
                name="ai-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={info.keyHint}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-w-0 flex-1"
              />
              <Button type="submit" disabled={testing || draft.trim() === ""}>
                {testing ? "Checking…" : "Check and save"}
              </Button>
            </div>
          </div>
        </div>
      )}
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-xs">
        <li>
          The key stays in this browser. It is never sent to UseHourly: your browser talks to the AI service directly.
          It is forgotten when you sign out.
        </li>
        <li>Only the description and the project and client names are sent. Never rates, amounts or other entries.</li>
        <li>
          You need an API key from {info.consoleName}, which is billed separately. A Claude Pro or Max plan, or ChatGPT
          Plus, can't be used.
        </li>
        <li>A suggestion is only a suggestion: nothing changes until you press Use this.</li>
      </ul>
    </SectionCard>
  );
}
