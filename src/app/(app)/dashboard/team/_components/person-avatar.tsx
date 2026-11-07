/** A hue from the name, so the same person always gets the same colour. */
function hueOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** A round monogram in a colour taken from the name (decorative: the name is always written next to it). */
export function Avatar({ label, className = "size-10" }: { label: string; className?: string }) {
  const hue = hueOf(label.toLowerCase());
  const initial = label.trim()[0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden
      style={{ ["--h" as string]: hue }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-[hsl(var(--h)_75%_55%/0.2)] font-display font-extrabold text-[hsl(var(--h)_70%_30%)] dark:text-[hsl(var(--h)_85%_75%)] ${className}`}
    >
      {initial}
    </span>
  );
}
