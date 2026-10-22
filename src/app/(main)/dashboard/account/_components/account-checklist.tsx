import { Check, Circle } from "lucide-react";

import { TileRing } from "@/components/stat-tile";

import type { AccountMe } from "./account-section";

/** What is left to set up on the account: four small steps, with a ring that says how many are done. Nothing here moves. */
export function AccountChecklist({ me }: { me: AccountMe }) {
  const steps: [string, boolean, string][] = [
    ["Email confirmed", !!me.email_verified_at, "Unlocks reminders and emailing invoices"],
    ["Password or social sign-in", true, "You can always get back in"],
    ["Friday reminder", me.weekly_reminder, "One email with your week so far"],
    ["Picture", !!me.avatar, "Shown beside your name"],
  ];
  const done = steps.filter(([, ok]) => ok).length;
  return (
    <section
      aria-label="Account setup"
      className="flex items-center gap-5 rounded-3xl bg-card p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
    >
      <div className="relative shrink-0">
        <TileRing fraction={done / steps.length} label={`${done} of ${steps.length} set up`} />
        <span className="absolute inset-0 grid place-content-center font-display font-extrabold text-lg">
          {done}/{steps.length}
        </span>
      </div>
      <ul className="grid min-w-0 flex-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {steps.map(([label, ok, hint]) => (
          <li key={label} className="flex items-start gap-2 text-sm">
            <span
              aria-hidden
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${ok ? "bg-success-bright text-white" : "border-2 border-foreground/30 border-dashed"}`}
            >
              {ok ? <Check className="size-3" /> : <Circle className="size-0" />}
            </span>
            <span className="min-w-0">
              <span className={ok ? "font-semibold" : "font-medium text-foreground/80"}>{label}</span>
              <span className="block text-muted-foreground text-xs">{hint}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
