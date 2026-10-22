/**
 * The look every text box, text area and drop-down shares: a pressed-in paper field (a hint of inner shadow, a soft
 * fill) that lifts on focus into a white field with an amber edge and a short amber underline, so the field you are in
 * is unmistakable. Kept in one place so a form's fields always match.
 */
export const FIELD_CLASS =
  "rounded-xl border border-input bg-muted/50 shadow-[inset_0_1px_2px_rgb(0_0_0/0.07)] transition-[border-color,background-color,box-shadow] duration-200 outline-none hover:border-foreground/30 focus-visible:border-amber focus-visible:bg-card focus-visible:shadow-[0_2px_0_0_var(--amber),0_0_0_4px_color-mix(in_oklab,var(--amber)_22%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_4px_color-mix(in_oklab,var(--destructive)_20%,transparent)]";
