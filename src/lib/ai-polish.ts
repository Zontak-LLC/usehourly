import { NOTE_MAX } from "./notes";

/**
 * "Polish" a time entry's description with the person's own Anthropic key (issue #98). The call is made from the
 * browser straight to Anthropic, so UseHourly never sees the key or the text. Only the note and the names of the
 * project and client are sent: never rates, amounts, other entries or anything about the account.
 */
export const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";
export const AI_MODEL = "claude-haiku-5-5";
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

export type AiErrorKind = "key" | "credit" | "rate" | "network" | "empty" | "other";

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

/** The request for one note: pure, so its exact contents (and what it leaves out) are tested. */
export function buildPolishRequest(key: string, input: PolishInput): { url: string; init: RequestInit } {
  const body = {
    model: AI_MODEL,
    max_tokens: 400,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Client: ${oneLine(input.client, 80)}\nProject: ${oneLine(input.project, 80)}\nNote: ${input.note.trim().slice(0, POLISH_MAX_INPUT)}`,
      },
    ],
  };
  return {
    url: AI_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        // Anthropic requires this header for a call made from a web page with the person's own key.
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    },
  };
}

/** What a failed answer means, as a plain sentence. */
export function explainStatus(status: number, bodyText: string): AiError {
  if (status === 401 || status === 403) {
    return new AiError("key", "Anthropic refused that key. Check it under Account, AI assistants.");
  }
  if (status === 429) return new AiError("rate", "Anthropic says that key is going too fast. Try again in a minute.");
  if (status === 402 || /credit balance|billing/i.test(bodyText)) {
    return new AiError("credit", "That key has no credit left. Add some in the Anthropic console, then try again.");
  }
  return new AiError("other", "Anthropic couldn't polish that right now. Try again in a moment.");
}

/** The polished note from Anthropic's answer, cleaned (no wrapping quotes, one line, within the note limit). */
export function parsePolishResponse(json: unknown): string {
  const blocks = (json as { content?: { type?: string; text?: string }[] } | null)?.content;
  const text = Array.isArray(blocks) ? blocks.find((b) => b?.type === "text" && typeof b.text === "string")?.text : "";
  const cleaned = oneLine(text ?? "", NOTE_MAX)
    .replace(/^["“”'`]+|["“”'`]+$/g, "")
    .trim();
  if (!cleaned) throw new AiError("empty", "Anthropic sent back nothing to use. Try again.");
  return cleaned;
}

/** Polishes one note. `fetchImpl` is injected so tests (and the key test) never touch the network. */
export async function polishNote(
  fetchImpl: typeof fetch,
  key: string,
  input: PolishInput,
  signal?: AbortSignal,
): Promise<string> {
  if (!input.note.trim()) throw new AiError("empty", "Type a few words first, then polish them.");
  const { url, init } = buildPolishRequest(key, input);
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new AiError("network", "Couldn't reach Anthropic. Check your connection and try again.");
  }
  if (!res.ok) throw explainStatus(res.status, await res.text().catch(() => ""));
  try {
    return parsePolishResponse(await res.json());
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError("other", "Anthropic's answer wasn't readable. Try again.");
  }
}

/** A tiny call that proves a key works (used by "Test key"): one word back is enough. */
export async function testKey(fetchImpl: typeof fetch, key: string): Promise<void> {
  await polishNote(fetchImpl, key, { note: "fixed bug", project: "Test", client: "Test" });
}
