import type { ReactNode } from "react";

/** Small pictures for the home page's feature tiles. Pure markup and colour, nothing to load; they sit on a tinted pad. */

const AMBER = "#F5A524";
const GREEN = "#3DDC97";
const VIOLET = "#8A6CFF";
const CORAL = "#ff7a45";

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
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[#F5A524] align-middle" />
          </span>
          <kbd className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">↵</kbd>
        </div>
        <div className="flex gap-1.5">
          {["+ 30 min", "+ 1 hour", "+ 2 hours"].map((t) => (
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

export function ApprovalArt() {
  return (
    <Pad>
      <div className="w-full max-w-[13rem] rounded-xl bg-card p-3 shadow-sm ring-1 ring-foreground/10">
        <div className="flex h-10 items-end justify-between gap-2 px-1">
          {(
            [
              ["Mon", 5],
              ["Tue", 7],
              ["Wed", 4],
              ["Thu", 8],
              ["Fri", 6],
            ] as [string, number][]
          ).map(([day, h], i) => (
            <span
              key={day}
              className="w-3 rounded-sm"
              style={{ height: h * 5, backgroundColor: i % 2 ? VIOLET : AMBER }}
            />
          ))}
        </div>
        <svg
          viewBox="0 0 120 24"
          className="mt-2 h-6 w-full"
          fill="none"
          stroke={VIOLET}
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <title>A signature</title>
          <path d="M4 16 C14 2, 20 22, 28 10 S42 4, 46 14 S62 20, 70 8 S86 14, 96 12" />
        </svg>
        <p className="text-[11px]" style={{ color: GREEN }}>
          ✓ Approved by Sam
        </p>
      </div>
    </Pad>
  );
}

export function BudgetArt() {
  const rows: [string, number, string][] = [
    ["Website", 45, GREEN],
    ["Support", 85, AMBER],
    ["Retainer", 100, "#ef4444"],
  ];
  return (
    <Pad>
      <div className="flex w-full max-w-[13rem] flex-col gap-2.5">
        {rows.map(([name, pct, color]) => (
          <div key={name}>
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span>{name}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-foreground/10">
              <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
          </div>
        ))}
      </div>
    </Pad>
  );
}

export function CalendarArt() {
  return (
    <Pad>
      <div className="flex w-full max-w-[13rem] flex-col gap-2">
        <div className="rounded-lg px-2.5 py-1.5 text-[11px]" style={{ backgroundColor: `${GREEN}26`, color: GREEN }}>
          Design review · 10:00–11:00
        </div>
        <span aria-hidden className="self-center text-muted-foreground">
          ↓ one tap
        </span>
        <div className="flex justify-between rounded-lg bg-card px-2.5 py-1.5 text-[11px] text-foreground shadow-sm ring-1 ring-foreground/10">
          <span>Acme · Design review</span>
          <span>1:00</span>
        </div>
      </div>
    </Pad>
  );
}

export function TeamArt() {
  const people: [string, string][] = [
    ["A", AMBER],
    ["M", VIOLET],
    ["S", GREEN],
  ];
  return (
    <Pad>
      <div className="flex flex-col items-center gap-3">
        <div className="flex -space-x-2">
          {people.map(([l, c]) => (
            <span
              key={l}
              className="grid size-10 place-items-center rounded-full font-bold text-[#12151b] text-sm ring-2 ring-muted"
              style={{ backgroundColor: c }}
            >
              {l}
            </span>
          ))}
          <span className="grid size-10 place-items-center rounded-full bg-card text-muted-foreground ring-2 ring-muted">
            +
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">their hours land on your books</span>
      </div>
    </Pad>
  );
}

export function CurrencyArt() {
  return (
    <Pad>
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-1.5">
          {["USD", "EUR", "GBP"].map((c, i) => (
            <span
              key={c}
              className="rounded-full px-2.5 py-1 text-[11px] ring-1 ring-foreground/10"
              style={i === 1 ? { backgroundColor: `${AMBER}33`, color: "inherit" } : undefined}
            >
              {c}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-foreground text-sm">
          <span className="text-muted-foreground line-through">1:07</span>
          <span aria-hidden>→</span>
          <span className="font-bold">1:15</span>
        </div>
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
            <span
              className="w-7 rounded-t-md"
              style={{ height: Number(h), backgroundColor: i === 3 ? AMBER : CORAL, opacity: i === 3 ? 1 : 0.55 }}
            />
            <span className="text-[10px] text-muted-foreground">{q}</span>
          </div>
        ))}
      </div>
    </Pad>
  );
}
