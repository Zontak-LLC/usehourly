"use client";

import { useEffect, useState } from "react";

import { formatDuration } from "@/lib/duration";

type Piece = { project_id: string; minutes: number; project: { name: string; client: { color: string } } };

/**
 * One bar for the whole day, cut into a coloured piece for each project by how long it took. It draws in from the left
 * the first time it shows. Under it, a small legend names each piece and its time.
 */
export function DayBar({ entries }: { entries: Piece[] }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const total = entries.reduce((s, e) => s + e.minutes, 0);
  if (total <= 0) return null;
  const by = new Map<string, { name: string; color: string; minutes: number }>();
  for (const e of entries) {
    const piece = by.get(e.project_id) ?? { name: e.project.name, color: e.project.client.color, minutes: 0 };
    piece.minutes += e.minutes;
    by.set(e.project_id, piece);
  }
  const pieces = [...by.values()].sort((a, b) => b.minutes - a.minutes);

  return (
    <div className="mt-3">
      <div
        aria-hidden
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted"
        style={{
          clipPath: grown ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
          transition: "clip-path 1s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        {pieces.map((p) => (
          <span
            key={p.name}
            className="h-full"
            style={{ width: `${(p.minutes / total) * 100}%`, backgroundColor: p.color }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-foreground/80 text-xs">
        {pieces.map((p) => (
          <li key={p.name} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
            {p.name}
            <span className="font-mono text-muted-foreground tabular-nums">{formatDuration(p.minutes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
