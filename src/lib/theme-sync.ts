import { THEME_MODE_VALUES, type ThemeMode } from "./preferences/theme";

export type SavedTheme = { mode: ThemeMode };

export const isThemeMode = (v: unknown): v is ThemeMode => THEME_MODE_VALUES.includes(v as ThemeMode);

/** Whatever was stored on the account, reduced to a value this version of the app still knows (else null). */
export function readSavedTheme(row: { theme_mode?: string | null }): { mode: ThemeMode | null } {
  return { mode: isThemeMode(row.theme_mode) ? row.theme_mode : null };
}

const DEFAULT_THEME: SavedTheme = { mode: "light" };

/**
 * What to do when a browser opens a signed-in page. The account wins where it has a value; a value the account
 * never stored is filled from this browser, but only when the browser's value is a real choice (not the default).
 */
export function planThemeSync(
  saved: { mode: ThemeMode | null },
  device: SavedTheme,
): { apply: Partial<SavedTheme>; save: Partial<SavedTheme> } {
  const apply: Partial<SavedTheme> = {};
  const save: Partial<SavedTheme> = {};
  if (saved.mode) {
    if (saved.mode !== device.mode) apply.mode = saved.mode;
  } else if (device.mode !== DEFAULT_THEME.mode) save.mode = device.mode;
  return { apply, save };
}
