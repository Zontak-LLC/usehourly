/**
 * The look every text box, text area and drop-down shares: a pressed-in paper field (a hint of inner shadow, a soft
 * fill) that lifts on focus into a white field with an ink edge and a soft halo, so the field you are in is unmistakable.
 * (Ink, not amber, since the drawing audit of 2026-10-23: amber is kept for the main button and today.) Kept in one place so a form's fields always match.
 */
export const FIELD_CLASS =
  "rounded-xl border border-input bg-muted/50 shadow-[inset_0_1px_2px_rgb(0_0_0/0.07)] transition-[border-color,background-color,box-shadow] duration-200 outline-none hover:border-foreground/30 focus-visible:border-foreground/70 focus-visible:bg-card focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--foreground)_12%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_4px_color-mix(in_oklab,var(--destructive)_20%,transparent)]";
