"use client";

import { useEffect, useState } from "react";

import { UserAvatar } from "@/components/user-avatar";
import { toISODate } from "@/lib/dates";
import { trpc } from "@/lib/trpc";

const since = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

/** A number that counts up from zero the first time it shows (the same trick the invoice total uses). */
function useCountUp(value: number, ms = 900): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(value);
    const t0 = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setShown(Math.round(value * (1 - (1 - k) ** 3)));
      if (k < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value, ms]);
  return shown;
}

/** Bars for the barcode, drawn from the account id so every badge has its own (decoration only). */
function barsFor(id: string): number[] {
  let h = 2166136261;
  return Array.from({ length: 36 }, (_, i) => {
    h = Math.imul(h ^ (id.charCodeAt(i % id.length) + i), 16777619);
    return 1 + ((h >>> 0) % 4);
  });
}

function Figure({ value, label }: { value: number; label: string }) {
  const shown = useCountUp(value);
  return (
    <div className="min-w-0">
      <p className="font-display font-extrabold text-3xl tabular-nums leading-none">
        <span aria-hidden>{shown.toLocaleString()}</span>
        <span className="sr-only">{value.toLocaleString()}</span>
      </p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground uppercase tracking-widest">{label}</p>
    </div>
  );
}

/**
 * The person's account as a membership badge: a punched lanyard slot, their picture and name, when they joined, a stamp,
 * and three figures that count up (hours logged, clients, invoices). It says who the account is at a glance, and it is
 * the one place on the page that is not a form.
 */
export function MemberBadge({
  me,
}: {
  me: { id: string; name: string | null; email: string; avatar: string | null; created_at: Date | string };
}) {
  const clients = trpc.clients.list.useQuery();
  const invoices = trpc.invoice.list.useQuery({});
  const day = toISODate(new Date());
  const totals = trpc.project.totals.useQuery({ from: day, to: day });
  const minutes = Object.values(totals.data ?? {}).reduce((s, t) => s + t.total, 0);
  const bars = barsFor(me.id);

  return (
    <section
      aria-label="Your membership badge"
      data-headerless="a badge, not a card with a header"
      className="relative mx-auto w-full max-w-md overflow-hidden rounded-3xl border bg-card shadow-[var(--shadow-sheet)] motion-safe:transition-transform motion-safe:duration-500 motion-safe:hover:-rotate-1"
    >
      <div className="flex items-center justify-between bg-foreground px-5 pt-6 pb-3 text-background">
        <span className="font-mono text-[11px] uppercase tracking-[0.25em]">UseHourly · Member</span>
        <span className="font-mono text-[11px] tracking-widest">№ {me.id.slice(0, 6).toUpperCase()}</span>
      </div>
      {/* the punched slot a badge hangs from */}
      <span
        aria-hidden
        className="absolute top-2 left-1/2 h-2 w-14 -translate-x-1/2 rounded-full bg-background shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]"
      />
      <div className="flex items-center gap-4 px-5 py-5">
        <UserAvatar name={me.name} avatar={me.avatar} className="size-20 border-2 text-2xl" />
        <div className="min-w-0">
          <p className="truncate font-display font-extrabold text-3xl leading-tight">{me.name || "You"}</p>
          <p className="truncate font-mono text-muted-foreground text-xs">{me.email}</p>
          <p className="mt-1 text-foreground/75 text-sm">Timekeeping since {since.format(new Date(me.created_at))}</p>
        </div>
      </div>
      <div className="relative grid grid-cols-3 gap-3 border-t border-dashed px-5 py-4">
        <Figure value={Math.floor(minutes / 60)} label="hours logged" />
        <Figure value={clients.data?.length ?? 0} label="clients" />
        <Figure value={invoices.data?.length ?? 0} label="invoices" />
      </div>
      <div className="flex items-end justify-between gap-4 border-t border-dashed px-5 py-4">
        <div aria-hidden className="flex h-9 items-end gap-[2px]">
          {bars.map((w, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed decoration, never reordered
            <span key={i} className="h-full bg-foreground" style={{ width: `${w}px` }} />
          ))}
        </div>
        {/* A rubber stamp: free, and it stays free. */}
        <span
          aria-hidden
          className="-rotate-6 rounded-md border-2 border-amber px-2 py-1 font-display font-extrabold text-amber text-sm uppercase tracking-widest motion-safe:animate-[stamp_0.5s_ease-out_0.4s_both]"
        >
          Free · always
        </span>
      </div>
    </section>
  );
}
