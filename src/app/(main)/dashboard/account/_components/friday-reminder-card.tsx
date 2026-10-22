"use client";

import { useState } from "react";

import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import type { AccountMe, EmailEnabled } from "./account-section";

export function FridayReminderCard({ me, emailEnabled }: { me: AccountMe; emailEnabled: EmailEnabled }) {
  const utils = trpc.useUtils();
  const setReminder = trpc.account.setWeeklyReminder.useMutation();
  // Checkboxes respond at once; the saved value takes over when the server answers (or the change is undone).
  const [reminderChoice, _setReminderChoice] = useState<boolean | null>(null);

  return (
    <SectionCard
      title="Friday reminder"
      description="One email on Friday afternoon with your week so far, so nothing goes unlogged. Turn it off any time, here or with the link in the email."
    >
      {/* The week as five days with Friday picked out: the picture of when the email comes. */}
      <ol aria-hidden className="grid grid-cols-5 gap-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
          <li
            key={d}
            className={`rounded-2xl py-2 text-center font-mono text-[11px] uppercase tracking-widest ${
              d === "Fri" ? "bg-amber text-[#1b1405]" : "bg-muted text-foreground/70"
            }`}
          >
            {d}
            <span className="mt-1 block font-sans text-[10px] normal-case tracking-normal">
              {d === "Fri" ? "email at 4pm" : "—"}
            </span>
          </li>
        ))}
      </ol>
      <label className="flex min-h-8 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={reminderChoice ?? me.weekly_reminder}
          disabled={setReminder.isPending || !emailEnabled?.enabled || !me.email_verified_at}
          onChange={async (e) => {
            try {
              await setReminder.mutateAsync({
                enabled: e.target.checked,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              });
              await utils.account.me.invalidate();
              toast.success(e.target.checked ? "You'll get a reminder on Friday afternoons." : "The reminder is off.");
            } catch (err) {
              toastError(err, "Couldn't save that.");
            }
          }}
        />
        Email me on Friday afternoon with my week so far
      </label>
      {emailEnabled && !emailEnabled.enabled && (
        <p className="text-muted-foreground text-xs">
          Email isn&rsquo;t set up on this server yet, so this can&rsquo;t be turned on.
        </p>
      )}
      {emailEnabled?.enabled && !me.email_verified_at && (
        <p className="text-muted-foreground text-xs">Confirm your email address above to turn this on.</p>
      )}
    </SectionCard>
  );
}
