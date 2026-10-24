import { JetBrains_Mono } from "next/font/google";

/**
 * Fonts (changed 2026-10-24, see "Fonts" in docs/ui-spec.md).
 *
 * Text and headings use the system font stack (`SYSTEM_FONT_STACK`, SF Pro on Apple devices): nothing is
 * downloaded for them. Only JetBrains Mono is loaded, for times, money and labels (`--font-mono`), so every
 * visitor gets fixed-width digits. The old picker list (Instrument Sans, Bricolage Grotesque, Geist and 17 more
 * Google fonts) was removed because `next/font` cannot load a font on demand: keeping them registered made every
 * page download all of them. An old `font=...` cookie is not in `fontKeys`, so `parsePreference` ignores it and
 * everyone gets the default.
 */
export const SYSTEM_FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

const fontRegistry = {
  system: {
    label: "System (SF Pro on Apple)",
  },
} as const;

export type FontKey = keyof typeof fontRegistry;

export const fontKeys = Object.keys(fontRegistry) as FontKey[];

/** The CSS variable classes put on `<body>`: only the number font is loaded. */
export const fontVars = jetBrainsMono.variable;

export const fontOptions = fontKeys.map((key) => ({
  key,
  label: fontRegistry[key].label,
}));
