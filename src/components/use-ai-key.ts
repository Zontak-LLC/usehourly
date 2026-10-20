"use client";

import { useCallback, useEffect, useState } from "react";

import { useCurrentUserId } from "@/components/offline-guard";
import { AI_KEY_EVENT, clearAiKey, readAiKey, saveAiKey } from "@/lib/ai-key";

const storage = () => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage blocked
  }
};

/** The signed-in account's saved Anthropic key (this browser only), kept in step across tabs and components. */
export function useAiKey() {
  const userId = useCurrentUserId();
  const [key, setKey] = useState<string | null>(null);
  const refresh = useCallback(() => setKey(readAiKey(storage(), userId)), [userId]);
  useEffect(() => {
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(AI_KEY_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(AI_KEY_EVENT, refresh);
    };
  }, [refresh]);
  const save = useCallback(
    (value: string) => {
      const ok = userId ? saveAiKey(storage(), userId, value) : false;
      window.dispatchEvent(new Event(AI_KEY_EVENT));
      return ok;
    },
    [userId],
  );
  const clear = useCallback(() => {
    clearAiKey(storage());
    window.dispatchEvent(new Event(AI_KEY_EVENT));
  }, []);
  return { key, save, clear };
}
