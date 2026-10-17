import Link from "next/link";

import { cn } from "cn";

const TABS = [
  { id: "day", label: "Day", href: (d: string) => `/dashboard/today?date=${d}` },
  { id: "week", label: "Week", href: (d: string) => `/dashboard/week?date=${d}` },
  { id: "month", label: "Month", href: (d: string) => `/dashboard/month?month=${d.slice(0, 7)}` },
] as const;

export type ViewTab = (typeof TABS)[number]["id"];

/** Day | Week | Month switcher shared by the three time pages; `date` is the day to carry across. */
export function ViewTabs({ current, date }: { current: ViewTab; date: string }) {
  return (
    <nav aria-label="Time view" data-testid="view-tabs" className="inline-flex rounded-lg bg-muted p-1">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href(date)}
          aria-current={t.id === current ? "page" : undefined}
          className={cn(
            "flex min-h-9 min-w-16 items-center justify-center rounded-md px-3 font-medium text-sm",
            t.id === current ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
