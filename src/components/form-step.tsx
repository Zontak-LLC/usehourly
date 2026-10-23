import type { ReactNode } from "react";

/** A numbered step in a long form: a mono number in an outlined disc, then the step's name, then its fields. */
export function FormStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-display font-extrabold text-lg">
        <span className="grid size-6 place-items-center rounded-full font-mono font-semibold text-foreground/80 text-xs ring-1 ring-foreground/30">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}
