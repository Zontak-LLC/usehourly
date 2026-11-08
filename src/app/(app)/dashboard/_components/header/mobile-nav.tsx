"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navLinks } from "@/navigation/sidebar/sidebar-items";

/** The six tabs, in order. Account, Help (and Insights for the owner) live in the account menu at the top right. */
export const TAB_IDS = ["today", "week", "month", "invoices", "clients", "report"] as const;

/**
 * The pages used most, as flat tabs (2026-11-08: the open one is ink with a 1px accent line under its word,
 * v4 drew a pill): centered in the top bar from 1024px up (below that it wraps onto its own line
 * under the logo) and a floating bar at the bottom of a phone, where a thumb reaches. Every page a person needs is a tab
 * (issue 217: the "More" menu is gone); Account and Help are in the account menu.
 */
export function MobileNav() {
  const pathname = usePathname();
  const items = TAB_IDS.map((id) => navLinks.find((l) => l.id === id)).filter((l) => l !== undefined);
  const tab =
    "flex min-w-0 items-center justify-center gap-0.5 whitespace-nowrap font-medium transition-colors max-sm:min-h-14 max-sm:flex-1 max-sm:flex-col max-sm:rounded-xl max-sm:text-xs max-[379px]:text-[11px] sm:relative sm:gap-1.5 sm:rounded-md sm:px-3 sm:py-2 sm:text-sm lg:gap-2 lg:px-3.5";

  return (
    <nav
      aria-label="Main pages"
      className="z-40 max-sm:fixed max-sm:inset-x-3 max-sm:bottom-[calc(0.75rem+env(safe-area-inset-bottom))] max-sm:rounded-2xl max-sm:border max-sm:bg-card max-sm:p-1 max-sm:shadow-[var(--shadow-sheet)] sm:order-last sm:w-full lg:order-none lg:w-auto lg:[html[data-nav-position=left]_&]:hidden"
    >
      <div className="flex gap-1 sm:mx-auto sm:w-fit sm:max-w-full sm:gap-0.5 sm:overflow-x-auto sm:[scrollbar-width:none]">
        {items.map((item) => {
          const active = pathname === item.url || pathname.startsWith(`${item.url}/`);
          return (
            <Link
              key={item.id}
              href={item.url}
              // Fetched ahead of time and kept for a few minutes, so a tab opens at once (and a cold Worker wakes up
              // before the click instead of after it).
              prefetch
              aria-current={active ? "page" : undefined}
              className={`${tab} ${
                active
                  ? "text-foreground max-sm:bg-muted sm:font-semibold sm:after:absolute sm:after:inset-x-3 sm:after:bottom-0 sm:after:h-px sm:after:bg-amber"
                  : "text-muted-foreground hover:text-foreground sm:hover:bg-muted/70"
              }`}
            >
              <item.icon className={`size-5 sm:size-4 sm:max-lg:hidden ${active ? "text-amber" : ""}`} aria-hidden />
              {item.short ?? item.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
