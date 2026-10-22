import { Avatar } from "./person-avatar";

type Person = { id: string; label: string; status: "pending" | "active" | "expired" | "removed"; clientIds: string[] };

/**
 * The team at a glance: three big figures (on your team, invitations waiting, clients they can log on) and a stack of
 * everyone's initials. It sits above the list, so the page opens with the answer before the rows.
 */
export function TeamStrip({ people }: { people: Person[] }) {
  const active = people.filter((p) => p.status === "active");
  const waiting = people.filter((p) => p.status === "pending").length;
  const covered = new Set(
    people.filter((p) => p.status === "active" || p.status === "pending").flatMap((p) => p.clientIds),
  ).size;
  const figures: [string, number][] = [
    ["On your team", active.length],
    ["Invitations waiting", waiting],
    ["Clients they can log on", covered],
  ];
  return (
    <section aria-label="The team at a glance" className="grid grid-cols-3 gap-3 lg:grid-cols-4">
      {figures.map(([label, value]) => (
        <dl
          key={label}
          className="flex flex-col justify-center rounded-3xl border-amber/70 border-t-2 bg-card p-4 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
        >
          <dd className="order-1 font-display font-extrabold text-4xl tabular-nums leading-none">{value}</dd>
          <dt className="order-2 mt-2 font-mono text-[11px] text-foreground/75 uppercase tracking-widest">{label}</dt>
        </dl>
      ))}
      <div
        aria-hidden
        className="flex items-center justify-center rounded-3xl bg-card p-4 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10 max-lg:hidden"
      >
        <div className="flex -space-x-3">
          {people.slice(0, 5).map((p) => (
            <Avatar key={p.id} label={p.label} className="size-12 ring-2 ring-card" />
          ))}
        </div>
      </div>
    </section>
  );
}
