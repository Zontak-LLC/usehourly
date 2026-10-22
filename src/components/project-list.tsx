"use client";

import { Check, Star } from "lucide-react";

import { highlightParts, type PickerProject, type PickerSection } from "@/lib/project-picker";

/**
 * The list under the search: sections (Recent, then one per client), rows with the project's colour dot, its name with
 * the typed letters in bold, its client, a star to pin it, and a tick on the picked one. It is a listbox driven by the
 * search field (`active` is the row the arrow keys are on); the mouse never takes the focus away from that field.
 */
export function ProjectList({
  sections,
  query,
  active,
  value,
  pinned,
  listId,
  onActive,
  onChoose,
  onTogglePin,
}: {
  sections: PickerSection[];
  query: string;
  active: number;
  value: string;
  pinned: string[];
  listId: string;
  onActive: (index: number) => void;
  onChoose: (id: string) => void;
  onTogglePin: (id: string) => void;
}) {
  let index = -1;
  if (sections.length === 0)
    return <p className="px-3 py-6 text-center text-muted-foreground text-sm">No project matches that.</p>;
  return (
    <div role="listbox" id={listId} aria-label="Projects" className="flex flex-col gap-2 py-1">
      {sections.map((s) => (
        <div key={s.key} role="presentation">
          {s.title && (
            <p className="flex items-center gap-2 px-3 pt-1 pb-1 font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
              {s.color && <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: s.color }} />}
              {s.title}
            </p>
          )}
          {s.items.map((p: PickerProject) => {
            index += 1;
            const i = index;
            const isPinned = pinned.includes(p.id);
            return (
              <div
                key={`${s.key}:${p.id}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => i !== active && onActive(i)}
                onClick={() => onChoose(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onChoose(p.id);
                  }
                }}
                className={`mx-1 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-1.5 ${
                  i === active ? "bg-muted" : ""
                }`}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color ?? "var(--muted-foreground)" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">
                    {highlightParts(p.name, query).map((part) => (
                      <span
                        key={part.at}
                        className={
                          part.hit
                            ? "font-extrabold underline decoration-2 decoration-amber underline-offset-2"
                            : undefined
                        }
                      >
                        {part.text}
                      </span>
                    ))}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">{p.clientName}</span>
                </span>
                {value === p.id && <Check className="size-4 shrink-0" aria-hidden />}
                <button
                  type="button"
                  aria-label={isPinned ? `Unpin ${p.name}` : `Pin ${p.name}`}
                  aria-pressed={isPinned}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin(p.id);
                  }}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
                >
                  <Star className={`size-4 ${isPinned ? "fill-amber text-amber" : ""}`} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
