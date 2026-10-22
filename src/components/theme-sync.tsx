"use client";

import { useEffect, useRef } from "react";

import { planThemeSync, type SavedTheme } from "@/lib/theme-sync";
import { trpc } from "@/lib/trpc";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

/**
 * Keeps the light/dark choice on the account, so a second device opens with it.
 * On load the account's saved choice is put on this browser (which also sets its cookie); a choice the account
 * never stored is taken from this browser. After that, every change made here is saved. Demo accounts do nothing.
 */
export function ThemeSync({ saved, enabled }: { saved: { mode: SavedTheme["mode"] | null }; enabled: boolean }) {
  const save = trpc.account.setTheme.useMutation();
  const mode = usePreferencesStore((s) => s.values.theme_mode);
  const isSynced = usePreferencesStore((s) => s.isSynced);
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const restored = useRef(false);
  const lastSent = useRef<string>("");

  useEffect(() => {
    if (!enabled || !isSynced) return;
    // First time: reconcile with the account (the account wins where it has a value).
    if (!restored.current) {
      restored.current = true;
      const plan = planThemeSync(saved, { mode });
      if (plan.apply.mode) setPreference("theme_mode", plan.apply.mode);
      lastSent.current = plan.apply.mode ?? mode;
      if (plan.save.mode) save.mutate(plan.save);
      return;
    }
    // After that, save whatever is picked here.
    const now = mode;
    if (now === lastSent.current) return;
    lastSent.current = now;
    save.mutate({ mode });
  }, [enabled, isSynced, saved, mode, setPreference, save]);

  return null;
}
