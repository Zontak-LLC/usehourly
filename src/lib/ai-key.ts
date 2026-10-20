/**
 * The person's own Anthropic API key (issue #98), kept ONLY in this browser (localStorage), under the account that
 * saved it. It is never sent to UseHourly's servers: the browser calls Anthropic directly. It is forgotten on sign-out
 * and whenever a different account is signed in, so it never stays readable on a shared device.
 */
export const AI_KEY_STORAGE = "hourly:aiKey";
export const AI_KEY_EVENT = "hourly:aiKey-changed";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Anthropic keys look like `sk-ant-…`; anything else is almost certainly something else pasted by mistake. */
export const isAnthropicKey = (key: string) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim());

/** The saved key for this account, or null (none saved, saved by another account, or storage unreadable). */
export function readAiKey(storage: StorageLike | null, userId: string | null | undefined): string | null {
  if (!storage || !userId) return null;
  try {
    const raw = storage.getItem(AI_KEY_STORAGE);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { userId?: unknown; key?: unknown };
    if (saved.userId !== userId || typeof saved.key !== "string" || !isAnthropicKey(saved.key)) return null;
    return saved.key;
  } catch {
    return null;
  }
}

/** Saves the key for this account. Returns false when it does not look like a key or storage refuses it. */
export function saveAiKey(storage: StorageLike | null, userId: string, key: string): boolean {
  const clean = key.trim();
  if (!storage || !userId || !isAnthropicKey(clean)) return false;
  try {
    storage.setItem(AI_KEY_STORAGE, JSON.stringify({ userId, key: clean }));
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
