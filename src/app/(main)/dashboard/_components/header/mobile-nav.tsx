"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navLinks } from "@/navigation/sidebar/sidebar-items";

/** The six tabs, in order. Account, Help (and Insights for the owner) live in the account menu at the top right. */
export const TAB_IDS = ["today", "week", "month", "invoices", "clients", "report"] as const;

/**
 * The pages used most, as a pill of tabs: centered in the top bar from 1024px up (below that it wraps onto its own line
 * under the logo) and a floating bar at the bottom of a phone, where a thumb reaches. Every page a person needs is a tab
 * (issue 217: the "More" menu is gone); Account and Help are in the account menu.
 */
export function MobileNav() {
  const pathname = usePathname();
  const items = TAB_IDS.map((id) => navLinks.find((l) => l.id === id)).filter((l) => l !== undefined);
  const tab =
    "flex min-w-0 items-center justify-center gap-0.5 whitespace-nowrap rounded-full font-medium transition-colors max-sm:min-h-14 max-sm:flex-1 max-sm:flex-col max-sm:text-xs max-[379px]:text-[11px] sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm lg:gap-2 lg:px-4";

  return (
    <nav
      aria-label="Main pages"
      className="z-40 max-sm:fixed max-sm:inset-x-3 max-sm:bottom-[calc(0.75rem+env(safe-area-inset-bottom))] max-sm:rounded-2xl max-sm:border max-sm:bg-card max-sm:p-1 max-sm:shadow-[var(--shadow-sheet)] sm:order-last sm:w-full lg:order-none lg:w-auto lg:[html[data-nav-position=left]_&]:hidden"
    >
      <div className="flex gap-1 sm:mx-auto sm:w-fit sm:max-w-full sm:overflow-x-auto sm:rounded-full sm:border sm:bg-muted sm:p-1 sm:[scrollbar-width:none]">
        {items.map((item) => {
          const active = pathname === item.url || pathname.startsWith(`${item.url}/`);
          return (
            <Link
              key={item.id}
              href={item.url}
              aria-current={active ? "page" : undefined}
              className={`${tab} ${
                active
                  ? "bg-card text-foreground shadow-sm max-sm:bg-muted"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className="size-5 sm:size-4 sm:max-lg:hidden" aria-hidden />
              {item.short ?? item.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
