/**
 * The AI services "Polish" can use with the person's own key (issue #98). Each one is a name, a way to recognise its
 * keys, a web address, a few cheap models to choose from (the first is the default: the low end, because tidying a
 * sentence needs nothing more), and how to ask it for a reply and read the answer. Everything here is pure.
 */
export type ProviderId = "anthropic" | "openai";

export type Prompt = { system: string; user: string };

type Provider = {
  label: string;
  /** Where the person gets a key. */
  consoleName: string;
  keyPattern: RegExp;
  keyHint: string;
  endpoint: string;
  /** The first is the default. */
  models: { id: string; label: string }[];
  headers(key: string): Record<string, string>;
  body(model: string, prompt: Prompt): unknown;
  /** The reply's text, or "" when there is none. */
  text(json: unknown): string;
};

const anthropic: Provider = {
  label: "Anthropic (Claude)",
  consoleName: "the Anthropic console (console.anthropic.com)",
  keyPattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
  keyHint: "sk-ant-…",
  endpoint: "https://api.anthropic.com/v1/messages",
  models: [
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fastest, cheapest)" },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (more careful)" },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5 (most capable, costs most)" },
  ],
  headers: (key) => ({
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    // Anthropic requires this header for a call made from a web page with the person's own key.
    "anthropic-dangerous-direct-browser-access": "true",
  }),
  body: (model, p) => ({
    model,
    max_tokens: 400,
    system: p.system,
    messages: [{ role: "user", content: p.user }],
  }),
  text(json) {
    const blocks = (json as { content?: { type?: string; text?: string }[] } | null)?.content;
    return Array.isArray(blocks)
      ? (blocks.find((b) => b?.type === "text" && typeof b.text === "string")?.text ?? "")
      : "";
  },
};

const openai: Provider = {
  label: "OpenAI (ChatGPT)",
  consoleName: "the OpenAI platform (platform.openai.com)",
  keyPattern: /^sk-(?!ant-)[A-Za-z0-9_-]{20,}$/,
  keyHint: "sk-…",
  endpoint: "https://api.openai.com/v1/chat/completions",
  models: [
    { id: "gpt-4.1-nano", label: "GPT-4.1 nano (fastest, cheapest)" },
    { id: "gpt-4o-mini", label: "GPT-4o mini (cheap)" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini (more careful)" },
  ],
  headers: (key) => ({ authorization: `Bearer ${key}` }),
  body: (model, p) => ({
    model,
    // `max_completion_tokens` is the name every current chat model accepts (older `max_tokens` is refused by some).
    max_completion_tokens: 400,
    messages: [
      { role: "system", content: p.system },
      { role: "user", content: p.user },
    ],
  }),
  text(json) {
    const choices = (json as { choices?: { message?: { content?: unknown } }[] } | null)?.choices;
    const content = Array.isArray(choices) ? choices[0]?.message?.content : "";
    return typeof content === "string" ? content : "";
  },
};

export const PROVIDERS: Record<ProviderId, Provider> = { anthropic, openai };
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export const isProviderId = (value: unknown): value is ProviderId => typeof value === "string" && value in PROVIDERS;

export const defaultModel = (provider: ProviderId) => PROVIDERS[provider].models[0].id;

/** Which service a pasted key belongs to, or null when it looks like neither. */
export function detectProvider(key: string): ProviderId | null {
  const k = key.trim();
  return PROVIDER_IDS.find((id) => PROVIDERS[id].keyPattern.test(k)) ?? null;
}

/** A model name someone typed: letters, digits and . _ - : / only, so it cannot carry anything into the request. */
export const isModelId = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/.test(value);
