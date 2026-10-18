const THEME_MODE_OPTIONS = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
] as const;

export const THEME_MODE_VALUES = THEME_MODE_OPTIONS.map((o) => o.value);
export type ThemeMode = (typeof THEME_MODE_VALUES)[number];
export type ResolvedThemeMode = "light" | "dark";

// --- theme presets (edit by hand when adding a preset; see src/styles/presets) ---

export const THEME_PRESET_OPTIONS = [
  {
    label: "Sunshine",
    value: "default",
    primary: {
      light: "oklch(0.79 0.17 75)",
      dark: "oklch(0.82 0.15 78)",
    },
  },
  {
    label: "Mint",
    value: "mint",
    primary: {
      light: "oklch(0.7 0.125 170)",
      dark: "oklch(0.78 0.12 170)",
    },
  },
  {
    label: "Coral",
    value: "coral",
    primary: {
      light: "oklch(0.7 0.16 33)",
      dark: "oklch(0.76 0.13 36)",
    },
  },
  {
    label: "Sky",
    value: "sky",
    primary: {
      light: "oklch(0.58 0.15 245)",
      dark: "oklch(0.75 0.11 240)",
    },
  },
  {
    label: "Lilac",
    value: "lilac",
    primary: {
      light: "oklch(0.57 0.17 295)",
      dark: "oklch(0.74 0.12 297)",
    },
  },
  {
    label: "Azure",
    value: "azure",
    primary: {
      light: "oklch(0.57 0.21 262)",
      dark: "oklch(0.72 0.14 254)",
    },
  },
  {
    label: "Cream",
    value: "cream",
    primary: {
      light: "oklch(0.52 0.07 60)",
      dark: "oklch(0.82 0.07 78)",
    },
  },
  {
    label: "Ink",
    value: "ink",
    primary: {
      light: "oklch(0.24 0.02 75)",
      dark: "oklch(0.93 0.02 85)",
    },
  },
  {
    label: "Mono",
    value: "mono",
    primary: {
      light: "oklch(0.145 0 0)",
      dark: "oklch(0.985 0 0)",
    },
  },
] as const;

export const THEME_PRESET_VALUES = THEME_PRESET_OPTIONS.map((p) => p.value);

export type ThemePreset = (typeof THEME_PRESET_OPTIONS)[number]["value"];
