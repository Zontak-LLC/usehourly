"use client";

import { Check, Circle } from "lucide-react";

/**
 * Which clients a person may log time on: a row of toggle buttons that wraps and fills the width, instead of one tick
 * box per line. A pressed button is one the person may use. Used by the invitation form and by each person's card.
 */
export function ClientChecks({
  legend,
  legendClassName = "mb-1 font-medium text-sm",
  clients,
  checked,
  onToggle,
  empty,
}: {
  legend: string;
  legendClassName?: string;
  clients: { id: string; name: string; color?: string | null }[];
  checked: string[];
  onToggle: (id: string, on: boolean) => void;
  /** Shown when there are no clients to pick from. */
  empty?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className={legendClassName}>{legend}</legend>
      {clients.length === 0 && empty && <p className="text-muted-foreground text-sm">{empty}</p>}
      <div className="flex flex-wrap gap-2">
        {clients.map((c) => {
          const on = checked.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(c.id, !on)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${
                on
                  ? "border-tint-edge bg-tint font-medium text-foreground hover:bg-tint-hover"
                  : "border-dashed bg-card text-muted-foreground hover:border-foreground/50 hover:text-foreground"
              }`}
            >
              {on ? (
                <Check className="size-3.5 text-current" aria-hidden />
              ) : (
                <Circle className="size-3.5 text-current" aria-hidden />
              )}
              {c.color && <span aria-hidden className="size-2 rounded-full" style={{ background: c.color }} />}
              {c.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
