"use client";

import { useCallback, useEffect, useState } from "react";

import { useCurrentUserId } from "@/components/offline-guard";
import { AI_KEY_EVENT, type AiSetup, clearAiKey, readAiSetup, saveAiSetup } from "@/lib/ai-key";

const storage = () => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage blocked
  }
};

/** The signed-in account's saved AI setup (service, key and model; this browser only), kept in step across tabs and components. */
export function useAiSetup() {
  const userId = useCurrentUserId();
  const [setup, setSetup] = useState<AiSetup | null>(null);
  const refresh = useCallback(() => setSetup(readAiSetup(storage(), userId)), [userId]);
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
    (value: AiSetup) => {
      const ok = userId ? saveAiSetup(storage(), userId, value) : false;
      window.dispatchEvent(new Event(AI_KEY_EVENT));
      return ok;
    },
    [userId],
  );
  const clear = useCallback(() => {
    clearAiKey(storage());
    window.dispatchEvent(new Event(AI_KEY_EVENT));
  }, []);
  return { setup, save, clear };
}
