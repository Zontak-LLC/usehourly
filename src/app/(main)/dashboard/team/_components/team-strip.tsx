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
    <section
      aria-label="The team at a glance"
      className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-1 py-2"
    >
      <dl className="grid flex-1 grid-cols-3 gap-x-4 sm:gap-x-8">
        {figures.map(([label, value]) => (
          <div key={label} className="border-amber/70 border-t-2 pt-3">
            <dd className="font-display font-extrabold text-3xl tabular-nums leading-none sm:text-5xl">{value}</dd>
            <dt className="mt-2 font-mono text-[11px] text-foreground/75 uppercase tracking-widest">{label}</dt>
          </div>
        ))}
      </dl>
      <div aria-hidden className="flex -space-x-3">
        {people.slice(0, 5).map((p) => (
          <Avatar key={p.id} label={p.label} className="size-11 ring-2 ring-card" />
        ))}
      </div>
    </section>
  );
}
