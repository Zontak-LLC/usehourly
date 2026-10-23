"use client";

import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

/**
 * Switches between light and dark: the opposite of what the page shows now. "System" is left as soon as someone picks,
 * because a switch with two looks must always change the look (from "system" on a dark device, a click means light).
 */
export function useToggleTheme(): () => void {
  const setPreference = usePreferencesStore((s) => s.setPreference);
  return () => {
    const dark = document.documentElement.classList.contains("dark");
    setPreference("theme_mode", dark ? "light" : "dark");
  };
}
