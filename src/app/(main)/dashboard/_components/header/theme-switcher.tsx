"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToggleTheme } from "@/components/use-toggle-theme";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

/**
 * The one appearance control (2026-10-23, issue 217): a sun/moon switch between light and dark. A moon in light mode
 * (press for dark), a sun in dark mode. It replaced the gear menu, which held only this choice in the first release.
 */
export function ThemeSwitcher() {
  const toggle = useToggleTheme();
  const synced = usePreferencesStore((s) => s.isSynced);
  const dark = usePreferencesStore((s) => s.resolvedThemeMode === "dark");
  return (
    <Button
      size="icon"
      variant="outline"
      onClick={toggle}
      aria-label="Dark mode"
      aria-pressed={synced ? dark : undefined}
      title="Switch between light and dark"
    >
      <Sun className="hidden dark:block" />
      <Moon className="block dark:hidden" />
    </Button>
  );
}
