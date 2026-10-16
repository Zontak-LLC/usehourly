import { MessageSquare } from "lucide-react";

import { feedbackMailto } from "@/lib/feedback";

/** Asks what people wish UseHourly could connect to; replies arrive by email, no backend needed. */
export function FeedbackCard() {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-medium">What should UseHourly connect to?</h2>
        <p className="text-muted-foreground text-sm">
          Spreadsheets, accounting, a calendar, something else? Tell us what you'd like to link it with. It takes a
          minute and helps decide what to build next.
        </p>
      </div>
      <a
        href={feedbackMailto()}
        className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-lg border bg-background px-5 font-medium text-foreground text-sm transition-colors hover:bg-muted"
      >
        <MessageSquare className="size-4" aria-hidden />
        Send an idea
      </a>
    </section>
  );
}
