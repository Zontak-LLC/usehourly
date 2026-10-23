"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Menu } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { adminLinks, navLinks } from "@/navigation/sidebar/sidebar-items";

const MAIN = ["today", "week", "month", "invoices", "clients", "account"];
/**
 * Tabs that only show where there is room: Account from 480px wide. On a narrower phone it stays in the More menu,
 * which hides its own copy once the tab shows. Full class names so Tailwind keeps them.
 */
const ROOMY: Record<string, { tab: string; menu: string }> = {
  account: { tab: "max-[479px]:hidden", menu: "min-[480px]:hidden" },
};

/**
 * The pages used most, as a pill of tabs: centered in the top bar from 1024px up (below that it wraps onto its own line
 * under the logo) and a floating bar at the bottom of a phone, where a thumb reaches. "More" is a real menu: the rarely
 * used pages. The signed-in person and Log out are in the top bar.
 */
export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const items = MAIN.map((id) => navLinks.find((l) => l.id === id)).filter((l) => l !== undefined);
  const more = [...navLinks.filter((l) => l.secondary), ...(isAdmin ? adminLinks : [])];
  const tab =
    "flex items-center justify-center gap-0.5 whitespace-nowrap rounded-full font-medium transition-colors max-sm:min-h-14 max-sm:flex-1 max-sm:flex-col max-sm:text-xs sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm lg:gap-2 lg:px-4";

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
              className={`${tab} ${ROOMY[item.id] ? `${ROOMY[item.id].tab} ` : ""}${
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={`${tab} text-muted-foreground aria-expanded:text-foreground`}>
              <Menu className="size-5 sm:size-4 sm:max-lg:hidden" aria-hidden />
              More
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            {more.map((item) => (
              <DropdownMenuItem key={item.id} asChild className={ROOMY[item.id]?.menu}>
                <Link href={item.url} prefetch={false}>
                  <item.icon /> {item.title}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
