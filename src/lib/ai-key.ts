import { defaultModel, detectProvider, isModelId, isProviderId, type ProviderId } from "./ai-provider";

/**
 * The person's own AI key (issue #98): which service, the key and the model, kept ONLY in this browser (localStorage),
 * under the account that saved it. It is never sent to UseHourly's servers: the browser calls the AI service directly.
 * It is forgotten on sign-out and whenever a different account is signed in, so it never stays readable on a shared device.
 */
export const AI_KEY_STORAGE = "hourly:aiKey";
export const AI_KEY_EVENT = "hourly:aiKey-changed";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type AiSetup = { provider: ProviderId; key: string; model: string };

/** The setup saved for this account, or null (none saved, saved by another account, damaged, or storage unreadable). */
export function readAiSetup(storage: StorageLike | null, userId: string | null | undefined): AiSetup | null {
  if (!storage || !userId) return null;
  try {
    const raw = storage.getItem(AI_KEY_STORAGE);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { userId?: unknown; key?: unknown; provider?: unknown; model?: unknown };
    if (saved.userId !== userId || typeof saved.key !== "string") return null;
    // The first version kept only an Anthropic key: no provider written means Anthropic.
    const provider = saved.provider === undefined ? "anthropic" : saved.provider;
    if (!isProviderId(provider) || detectProvider(saved.key) !== provider) return null;
    const model = typeof saved.model === "string" && isModelId(saved.model) ? saved.model : defaultModel(provider);
    return { provider, key: saved.key, model };
  } catch {
    return null;
  }
}

/** Saves the setup for this account. Returns false when the key is not one for that service or storage refuses it. */
export function saveAiSetup(storage: StorageLike | null, userId: string, setup: AiSetup): boolean {
  const key = setup.key.trim();
  if (!storage || !userId || detectProvider(key) !== setup.provider || !isModelId(setup.model)) return false;
  try {
    storage.setItem(AI_KEY_STORAGE, JSON.stringify({ userId, provider: setup.provider, key, model: setup.model }));
    return true;
  } catch {
    return false;
  }
}

export function clearAiKey(storage: StorageLike | null): void {
  try {
    storage?.removeItem(AI_KEY_STORAGE);
  } catch {
    // storage blocked
  }
}
