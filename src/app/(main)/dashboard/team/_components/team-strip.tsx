"use client";

import { Mail } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { useCountUp } from "@/lib/use-count-up";

type Person = { id: string; label: string; status: "pending" | "active" | "expired" | "removed"; clientIds: string[] };

const SEATS = 5;
const RING = 2 * Math.PI * 22;

/** One tile: the figure counts up, with a small drawing that says what it counts. */
function Tile({ label, value, children }: { label: string; value: number; children: React.ReactNode }) {
  const shown = useCountUp(value);
  return (
    <dl className="relative flex items-center justify-between gap-3 overflow-hidden rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 transition-all duration-300 motion-safe:animate-[settle_0.6s_ease-out_both] motion-safe:hover:-translate-y-0.5 motion-safe:hover:ring-amber/60">
      <div>
        <dd className="order-1 font-display font-extrabold text-5xl tabular-nums leading-none">{shown}</dd>
        <dt className="order-2 mt-2 font-mono text-[11px] text-foreground/75 uppercase tracking-widest">{label}</dt>
      </div>
      <div aria-hidden className="shrink-0">
        {children}
      </div>
    </dl>
  );
}

/**
 * The team at a glance, as three tiles with a drawing each: five seats that fill with amber as people join, an envelope
 * that pulses while invitations wait, and a ring for how many of your clients someone can log time on. The figures
 * count up when the page opens.
 */
export function TeamStrip({ people }: { people: Person[] }) {
  const clients = trpc.clients.list.useQuery();
  const active = people.filter((p) => p.status === "active");
  const waiting = people.filter((p) => p.status === "pending").length;
  const covered = new Set(
    people.filter((p) => p.status === "active" || p.status === "pending").flatMap((p) => p.clientIds),
  ).size;
  const total = Math.max(covered, clients.data?.length ?? 0, 1);
  return (
    <section aria-label="The team at a glance" className="grid gap-3 sm:grid-cols-3">
      <Tile label="On your team" value={active.length}>
        <div className="flex -space-x-2">
          {Array.from({ length: SEATS }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: five fixed seats
              key={i}
              style={{ animationDelay: `${i * 120}ms` }}
              className={`grid size-8 place-items-center rounded-full ring-2 ring-card motion-safe:animate-[settle_0.5s_ease-out_both] ${
                i < active.length ? "bg-amber text-[#1b1405]" : "border-2 border-foreground/35 border-dashed bg-card"
              }`}
            >
              {i < active.length && <span className="size-2 rounded-full bg-[#1b1405]" />}
            </span>
          ))}
        </div>
      </Tile>
      <Tile label="Invitations waiting" value={waiting}>
        <span className="relative grid size-14 place-items-center">
          {waiting > 0 && (
            <span className="absolute inset-0 rounded-full bg-amber/40 motion-safe:animate-[ring-ping_2s_ease-out_infinite]" />
          )}
          <span
            className={`relative grid size-12 place-items-center rounded-full ${waiting > 0 ? "bg-amber text-[#1b1405]" : "bg-muted text-foreground/60"}`}
          >
            <Mail className="size-6" />
          </span>
        </span>
      </Tile>
      <Tile label="Clients they can log on" value={covered}>
        <svg viewBox="0 0 56 56" role="img" aria-label="Share of your clients covered" className="size-14 -rotate-90">
          <title>Share of your clients covered</title>
          <circle cx="28" cy="28" r="22" fill="none" stroke="var(--muted)" strokeWidth="6" />
          <circle
            cx="28"
            cy="28"
            r="22"
            fill="none"
            stroke="var(--amber)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - covered / total)}
            style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)" }}
          />
        </svg>
      </Tile>
    </section>
  );
}
