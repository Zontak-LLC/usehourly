// UseHourly's rules for packages/quality-gates (`npm run check:rules`, part of `npm run ci`).
// The generic rules come from the package; what is below is only what is UseHourly's own.
export default {
  files: {
    include: ["src", "e2e", "scripts", "bridge", "packages", "custom-worker.ts"],
    extensions: ["ts", "tsx", "mjs"],
  },
  rules: {
    "no-double-cast": { only: ["src/**"] },
    "no-raw-header": {
      header: "cf-connecting-ip",
      message: "read the client address with clientIpFrom(), never cf-connecting-ip directly",
      skip: ["**/client-ip.ts", "**/__tests__/**"],
    },
  },
  // UI rules (docs/ui-spec.md): one shade per depth, one empty state, one notice.
  custom: [
    {
      message: "a card header band uses bg-band-1/2/3, not bg-muted/40 (docs/ui-spec.md)",
      pattern: /border-b bg-muted\/40/,
      only: ["src/**"],
    },
    {
      message: "a notice box is the Notice component, not a hand-made tinted box (docs/ui-spec.md)",
      pattern: /rounded-(lg|xl) border bg-muted\/40 p-/,
      only: ["src/**"],
    },
    {
      message: "an empty state is the EmptyState component, not a hand-made dashed paragraph (docs/ui-spec.md)",
      pattern: /<p className="[^"]*border-dashed/,
      only: ["src/**"],
    },
  ],
  // The colour guard (docs/ui-spec.md, "Colour legend"): named colours live in src/lib/palette.ts.
  colours: {
    include: ["src"],
    extensions: ["ts", "tsx"],
    exclude: ["**/__tests__/**", "**/*.test.*", "src/lib/palette.ts"],
    baseline: "scripts/colour-baseline.json",
    hint: "Use a theme token or src/lib/palette.ts, and add the colour to the legend in docs/ui-spec.md.",
  },
};
