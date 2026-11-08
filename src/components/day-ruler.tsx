/**
 * The home page's drawing (2026-11-08): one day on an hour ruler, the way UseHourly sees it. Three blocks of the sample
 * week (the same projects and times as the Today screen in the deck below), thin hour lines, and one accent line: the
 * hour hand, "now". It is a picture, not a control: no buttons, no motion, one accessible name.
 */
const START = 9;
const END = 17;
const HOURS = Array.from({ length: END - START + 1 }, (_, i) => START + i);

type Block = { project: string; from: number; to: number; dot: string; time: string };

// The demo's own day (Today screen in the deck): 1:30 + 0:45 + 2:00 = 4:15.
const BLOCKS: Block[] = [
  { project: "Mobile app", from: 9, to: 10.5, dot: "bg-emerald-500", time: "1:30" },
  { project: "Monthly support", from: 11, to: 11.75, dot: "bg-sky-400", time: "0:45" },
  { project: "Admin and invoicing", from: 13, to: 15, dot: "bg-orange-400", time: "2:00" },
];
const NOW = 15.5;

const at = (h: number) => `${((h - START) / (END - START)) * 100}%`;

export function DayRuler() {
  return (
    <figure
      role="img"
      aria-label="A day in UseHourly: 4 hours 15 minutes logged on three projects"
      className="relative w-full overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-sheet)]"
    >
      {/* the typed line: what a person does all day long */}
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 min-w-24 items-center rounded-lg border border-[var(--input)] bg-background px-3 font-mono text-base text-foreground">
            1.5
            <span className="ml-px inline-block h-5 w-px bg-amber" />
          </span>
          <span className="font-mono text-muted-foreground text-sm">↵</span>
          <span className="truncate text-muted-foreground text-sm">
            = 1:30<span className="max-sm:hidden"> on Mobile app</span>
          </span>
        </div>
        <span className="hidden font-mono text-muted-foreground text-xs uppercase tracking-[0.2em] sm:inline">
          Today
        </span>
      </div>

      {/* the ruler */}
      <div className="px-5 pt-4 pb-5">
        <div className="relative h-[12.5rem]">
          {HOURS.map((h) => (
            <div key={h} className="absolute inset-y-0" style={{ left: at(h) }}>
              <div className="absolute top-6 bottom-0 w-px bg-border" />
              <span
                className={`absolute top-0 -translate-x-1/2 font-mono text-[11px] text-muted-foreground tabular-nums ${
                  h === START || h === END ? "max-sm:hidden" : ""
                } ${h % 2 === 0 ? "" : "max-sm:hidden"}`}
              >
                {h}
              </span>
            </div>
          ))}
          {HOURS.slice(0, -1).map((h) => (
            <div key={`half-${h}`} className="absolute top-6 h-1.5 w-px bg-border" style={{ left: at(h + 0.5) }} />
          ))}

          {/* One lane per entry: the words above, the time as a slim bar on the ruler. A block past midday hangs its words
              from its right end, so they never run off the card. */}
          {BLOCKS.map((b, i) => {
            const late = b.from >= (START + END) / 2;
            return (
              <div
                key={b.project}
                className="absolute"
                style={{ left: at(b.from), width: `calc(${at(b.to)} - ${at(b.from)})`, top: `${3.4 + i * 3.1}rem` }}
              >
                <p
                  className={`absolute bottom-3 flex items-center gap-1.5 whitespace-nowrap bg-card py-0.5 text-[13px] leading-none ${
                    late ? "right-0 pl-1.5" : "left-0 pr-1.5"
                  }`}
                >
                  <span className={`size-2 shrink-0 rounded-full ${b.dot}`} />
                  <span className="font-medium">{b.project}</span>
                  <span className="font-mono text-[12px] text-muted-foreground tabular-nums">{b.time}</span>
                </p>
                <div className="absolute top-0 h-1.5 w-full rounded-full bg-foreground/25" />
              </div>
            );
          })}

          {/* the hour hand */}
          <div className="absolute top-5 bottom-0 w-px bg-amber" style={{ left: at(NOW) }}>
            <span className="absolute -top-1 -left-[3px] size-[7px] rounded-full bg-amber" />
          </div>
        </div>
      </div>

      {/* the day's total, toward an 8-hour day */}
      <div className="flex items-end justify-between gap-4 border-t px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-sm">Day total</p>
          <div className="mt-2 h-0.5 w-full max-w-64 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-amber" style={{ width: `${(4.25 / 8) * 100}%` }} />
          </div>
        </div>
        <p className="font-mono font-semibold text-3xl tabular-nums tracking-tight">4:15</p>
      </div>
    </figure>
  );
}
