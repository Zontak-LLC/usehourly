import { THEME_MODE_VALUES, THEME_PRESET_VALUES, type ThemeMode, type ThemePreset } from "./preferences/theme";

export type SavedTheme = { preset: ThemePreset; mode: ThemeMode };

export const isThemePreset = (v: unknown): v is ThemePreset => THEME_PRESET_VALUES.includes(v as ThemePreset);
export const isThemeMode = (v: unknown): v is ThemeMode => THEME_MODE_VALUES.includes(v as ThemeMode);

/** Whatever was stored on the account, reduced to values this version of the app still knows (else null). */
export function readSavedTheme(row: { theme_preset?: string | null; theme_mode?: string | null }): {
  preset: ThemePreset | null;
  mode: ThemeMode | null;
} {
  return {
    preset: isThemePreset(row.theme_preset) ? row.theme_preset : null,
    mode: isThemeMode(row.theme_mode) ? row.theme_mode : null,
  };
}

const DEFAULT_THEME: SavedTheme = { preset: "default", mode: "light" };

/**
 * What to do when a browser opens a signed-in page. The account wins where it has a value; a value the account
 * never stored is filled from this browser, but only when the browser's value is a real choice (not the default).
 */
export function planThemeSync(
  saved: { preset: ThemePreset | null; mode: ThemeMode | null },
  device: SavedTheme,
): { apply: Partial<SavedTheme>; save: Partial<SavedTheme> } {
  const apply: Partial<SavedTheme> = {};
  const save: Partial<SavedTheme> = {};
  if (saved.preset) {
    if (saved.preset !== device.preset) apply.preset = saved.preset;
  } else if (device.preset !== DEFAULT_THEME.preset) save.preset = device.preset;
  if (saved.mode) {
    if (saved.mode !== device.mode) apply.mode = saved.mode;
  } else if (device.mode !== DEFAULT_THEME.mode) save.mode = device.mode;
  return { apply, save };
}
