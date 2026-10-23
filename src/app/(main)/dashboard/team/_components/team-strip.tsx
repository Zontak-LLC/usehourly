"use client";

import { Mail } from "lucide-react";

import { ShareBar, StatTile } from "@/components/stat-tile";
import { word } from "@/lib/plural";
import { trpc } from "@/lib/trpc";

type Person = { id: string; label: string; status: "pending" | "active" | "expired" | "removed"; clientIds: string[] };

const SEATS = 5;

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
      <StatTile label="On your team" value={active.length}>
        <div className="flex -space-x-2">
          {Array.from({ length: SEATS }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: five fixed seats
              key={i}
              className={`grid size-8 place-items-center rounded-full ring-2 ring-card ${
                i < active.length ? "bg-amber text-[#1b1405]" : "border-2 border-foreground/35 border-dashed bg-card"
              }`}
            >
              {i < active.length && <span className="size-2 rounded-full bg-[#1b1405]" />}
            </span>
          ))}
        </div>
      </StatTile>
      <StatTile label={`${word(waiting, "Invitation")} waiting`} value={waiting}>
        <span className="relative grid size-14 place-items-center">
          <span
            className={`relative grid size-12 place-items-center rounded-full ${waiting > 0 ? "bg-amber text-[#1b1405]" : "bg-muted text-foreground/60"}`}
          >
            <Mail className="size-6" />
          </span>
        </span>
      </StatTile>
      <StatTile label={`${word(covered, "Client")} they can log on`} value={covered}>
        <ShareBar fraction={covered / total} label="Share of your clients covered" />
      </StatTile>
    </section>
  );
}
