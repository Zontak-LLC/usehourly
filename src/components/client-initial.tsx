/**
 * A client's initial on a soft tint of the client's own colour (drawing audit, 2026-10-23). It used to be a saturated
 * tile with a white letter: the loudest mark on each card, and its amber, green or violet read as "main action", "paid"
 * or "waiting". A tint names the client without borrowing a meaning colour. Clients and Invoices draw it the same way.
 */
export function ClientInitial({ name, colour, quiet = false }: { name: string; colour?: string; quiet?: boolean }) {
  const c = colour ?? "var(--foreground)";
  return (
    <span
      aria-hidden
      className={`grid size-10 shrink-0 place-items-center rounded-xl font-display font-semibold text-base text-foreground ${quiet ? "opacity-60" : ""}`}
      style={{
        background: `color-mix(in oklab, ${c} 18%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 40%, transparent)`,
      }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
