import type { ReactNode } from "react";

/** Small pictures for the home page's feature tiles. Pure markup and colour, nothing to load; they sit on a tinted pad. */

const AMBER = "#5A63D8"; // the accent (v4 periwinkle); the name stays so the drawings did not change
const GREEN = "#3DDC97";
const VIOLET = "#8A6CFF";

function Pad({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="flex h-32 items-center justify-center overflow-hidden rounded-2xl bg-muted/60 px-4 font-mono text-xs"
    >
      {children}
    </div>
  );
}

export function QuickEntryArt() {
  return (
    <Pad>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <div className="flex items-center justify-between rounded-xl bg-card px-3 py-2 shadow-sm ring-1 ring-foreground/10">
          <span className="text-base text-foreground">
            1h30
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#5A63D8] align-middle" />
          </span>
          <kbd className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">↵</kbd>
        </div>
        <div className="flex items-center gap-1.5">
          {/* the quick-time chips as the app writes them; tapping one again adds it again */}
          <span className="rounded-full bg-foreground px-2.5 py-1 text-[11px] text-background">2h ×2 = 4h</span>
          {["30m", "1h"].map((t) => (
            <span
              key={t}
              className="rounded-full bg-card px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-foreground/10"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </Pad>
  );
}

export function InvoiceArt() {
  return (
    <Pad>
      <div className="relative w-44 rounded-lg bg-card p-3 shadow-md ring-1 ring-foreground/10">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>INVOICE</span>
          <span>INV-2026-014</span>
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 w-full rounded bg-foreground/10" />
          <div className="h-1.5 w-4/5 rounded bg-foreground/10" />
        </div>
        <p className="mt-2 text-right font-bold text-base text-foreground">$2,327.50</p>
        <span
          className="absolute top-5 right-2 -rotate-12 rounded-md border-2 bg-card/90 px-1.5 py-0.5 font-bold text-[11px] tracking-widest"
          style={{ color: GREEN, borderColor: GREEN }}
        >
          PAID
        </span>
      </div>
    </Pad>
  );
}

/** The week as seven day buttons: hours under each, a thin bar, and past weekdays with nothing logged as dashed gaps. */
export function WeekArt() {
  const days: [string, string, number][] = [
    ["Mon", "–", 0],
    ["Tue", "6:15", 0.78],
    ["Wed", "–", 0],
    ["Thu", "7:30", 0.94],
    ["Fri", "4:00", 0.5],
  ];
  return (
    <Pad>
      <div className="grid w-full max-w-xs grid-cols-5 gap-1.5">
        {days.map(([day, hours, fill], i) => (
          <div
            key={day}
            className={`relative flex flex-col items-center gap-0.5 overflow-hidden rounded-lg px-1 py-2 ${
              fill ? "bg-card ring-1 ring-foreground/10" : "border border-foreground/30 border-dashed"
            } ${i === 3 ? "ring-2" : ""}`}
            style={i === 3 ? { boxShadow: `0 0 0 2px ${AMBER}` } : undefined}
          >
            <span className="text-[10px] text-muted-foreground uppercase">{day}</span>
            <span className="text-[11px] text-foreground">{hours}</span>
            <span className="absolute inset-x-0 bottom-0 h-1 bg-foreground/10">
              <span className="block h-full bg-foreground/40" style={{ width: `${fill * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
    </Pad>
  );
}

/** A month of days, one entry being dragged from one day onto another. */
export function MonthArt() {
  return (
    <Pad>
      <div className="relative grid w-full max-w-[15rem] grid-cols-7 gap-1">
        {Array.from({ length: 14 }, (_, i) => i + 6).map((d) => (
          <div
            key={d}
            className={`flex h-9 flex-col justify-between rounded-md p-1 text-[9px] ${
              d === 15 ? "ring-2" : "bg-card ring-1 ring-foreground/10"
            }`}
            style={d === 15 ? { boxShadow: `0 0 0 2px ${AMBER}`, backgroundColor: `${AMBER}22` } : undefined}
          >
            <span className="text-muted-foreground">{d}</span>
            {[8, 9, 13, 16].includes(d) && <span className="h-1 rounded-full bg-foreground/35" />}
          </div>
        ))}
        <span className="absolute top-[30%] left-[30%] rotate-[-4deg] rounded-md bg-card px-2 py-1 text-[10px] text-foreground shadow-md ring-1 ring-foreground/15">
          ⠿ Logo review · 1:30
        </span>
      </div>
    </Pad>
  );
}

/** A client card: the month's hours and what they are worth, and the button that turns it into an invoice. */
export function ClientsArt() {
  return (
    <Pad>
      <div className="flex w-full max-w-xs items-center gap-2.5 rounded-xl bg-card p-3 shadow-sm ring-1 ring-foreground/10">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-lg font-bold text-sm text-white"
          style={{ backgroundColor: VIOLET }}
        >
          N
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-sans font-semibold text-foreground text-sm">Northwind</p>
          <p className="truncate text-[10px] text-muted-foreground">
            32:44 · <span className="font-semibold text-foreground">$1,473</span> this month
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] text-foreground ring-1 ring-foreground/15">
          Make invoice
        </span>
      </div>
    </Pad>
  );
}

export function YearArt() {
  return (
    <Pad>
      <div className="flex h-20 items-end gap-3">
        {[
          ["Q1", 40],
          ["Q2", 62],
          ["Q3", 50],
          ["Q4", 78],
        ].map(([q, h], i) => (
          <div key={q} className="flex flex-col items-center gap-1">
            {/* the latest quarter in amber, the rest soft grey (a faded coral read as brown on the dark page) */}
            <span
              className={i === 3 ? "w-7 rounded-t-md" : "w-7 rounded-t-md bg-foreground/20"}
              style={{ height: Number(h), ...(i === 3 ? { backgroundColor: AMBER } : {}) }}
            />
            <span className="text-[10px] text-muted-foreground">{q}</span>
          </div>
        ))}
      </div>
    </Pad>
  );
}
