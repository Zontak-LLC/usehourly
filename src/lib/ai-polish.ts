import type { AiSetup } from "./ai-key";
import { PROVIDERS, type ProviderId } from "./ai-provider";
import { NOTE_MAX } from "./notes";

/**
 * "Polish" a time entry's description with the person's own AI key (issue #98): Anthropic (Claude) or OpenAI (ChatGPT).
 * The call is made from the browser straight to the service, so UseHourly never sees the key or the text. Only the note
 * and the names of the project and client are sent: never rates, amounts, other entries or anything about the account.
 */
/** Longest note sent for polishing: a description, not a document (the box itself takes up to NOTE_MAX). */
export const POLISH_MAX_INPUT = 1000;

const SYSTEM = [
  "You tidy the descriptions freelancers type on their timesheets, so they read clearly on a client's invoice.",
  "Rewrite the note as one or two short, plain sentences in the same language.",
  "Keep every fact in it and add nothing: no new tasks, numbers, names or promises.",
  "Do not use quotation marks, markdown, bullet points or a greeting.",
  "Reply with the rewritten note only.",
].join(" ");

export type PolishInput = { note: string; project: string; client: string };

export type AiErrorKind = "key" | "credit" | "rate" | "model" | "network" | "empty" | "other";

/** A problem calling the AI service, in words fit to show the person. Never carries the service's own text. */
export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
  }
}

const oneLine = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);
const nameOf = (provider: ProviderId) => PROVIDERS[provider].label.split(" ")[0];

/** The request for one note: pure, so its exact contents (and what it leaves out) are tested. */
export function buildPolishRequest(setup: AiSetup, input: PolishInput): { url: string; init: RequestInit } {
  const provider = PROVIDERS[setup.provider];
  const user = `Client: ${oneLine(input.client, 80)}\nProject: ${oneLine(input.project, 80)}\nNote: ${input.note.trim().slice(0, POLISH_MAX_INPUT)}`;
  return {
    url: provider.endpoint,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", ...provider.headers(setup.key) },
      body: JSON.stringify(provider.body(setup.model, { system: SYSTEM, user })),
    },
  };
}

/** What a failed answer means, as a plain sentence. */
export function explainStatus(provider: ProviderId, status: number, bodyText: string): AiError {
  const name = nameOf(provider);
  if (status === 401 || status === 403) {
    return new AiError("key", `${name} refused that key. Check it under Account, AI assistants.`);
  }
  if (status === 404) {
    return new AiError("model", `${name} doesn't have that model for your key. Choose another model under Account.`);
  }
  // OpenAI reports an empty balance as 429 "insufficient_quota"; Anthropic as 400 "credit balance is too low".
  if (status === 402 || /credit balance|insufficient_quota|billing/i.test(bodyText)) {
    return new AiError("credit", `That key has no credit left. Add some with ${name}, then try again.`);
  }
  if (status === 429) return new AiError("rate", `${name} says that key is going too fast. Try again in a minute.`);
  return new AiError("other", `${name} couldn't polish that right now. Try again in a moment.`);
}

/** The polished note from the service's answer, cleaned (no wrapping quotes, one line, within the note limit). */
export function parsePolishResponse(provider: ProviderId, json: unknown): string {
  const text = PROVIDERS[provider].text(json);
  const cleaned = oneLine(text, NOTE_MAX)
    .replace(/^["“”'`]+|["“”'`]+$/g, "")
    .trim();
  if (!cleaned) throw new AiError("empty", `${nameOf(provider)} sent back nothing to use. Try again.`);
  return cleaned;
}

/** Polishes one note. `fetchImpl` is injected so tests (and the key test) never touch the network. */
export async function polishNote(
  fetchImpl: typeof fetch,
  setup: AiSetup,
  input: PolishInput,
  signal?: AbortSignal,
): Promise<string> {
  if (!input.note.trim()) throw new AiError("empty", "Type a few words first, then polish them.");
  const { url, init } = buildPolishRequest(setup, input);
  const name = nameOf(setup.provider);
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new AiError("network", `Couldn't reach ${name}. Check your connection and try again.`);
  }
  if (!res.ok) throw explainStatus(setup.provider, res.status, await res.text().catch(() => ""));
  try {
    return parsePolishResponse(setup.provider, await res.json());
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError("other", `${name}'s answer wasn't readable. Try again.`);
  }
}

/** A tiny call that proves a key and model work (used by "Check and save"): one short sentence back is enough. */
export async function testKey(fetchImpl: typeof fetch, setup: AiSetup): Promise<void> {
  await polishNote(fetchImpl, setup, { note: "fixed bug", project: "Test", client: "Test" });
}
