"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogOut, Menu } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutOfDevice } from "@/lib/sign-out";
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
 * The pages used most: a tab bar at the bottom of a phone (where a thumb reaches) and a strip under the top bar from `sm` up. Every tab has an icon and a word, and
 * "More" is a real menu: the rarely used pages, the signed-in address and Log out.
 */
export function MobileNav({ user, isAdmin = false }: { user: { name: string; email: string }; isAdmin?: boolean }) {
  const pathname = usePathname();
  const items = MAIN.map((id) => navLinks.find((l) => l.id === id)).filter((l) => l !== undefined);
  const more = [...navLinks.filter((l) => l.secondary), ...(isAdmin ? adminLinks : [])];

  return (
    <nav
      aria-label="Main pages"
      className="max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 z-40 bg-background max-sm:border-t max-sm:pb-[env(safe-area-inset-bottom)] sm:sticky sm:top-12 lg:[html[data-nav-position=left]_&]:hidden"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-6 min-[480px]:grid-cols-7">
        {items.map((item) => {
          const active = pathname === item.url || pathname.startsWith(`${item.url}/`);
          return (
            <Link
              key={item.id}
              href={item.url}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 border-b-2 px-1 text-xs font-medium max-sm:border-t-2 max-sm:border-b-0 ${
                ROOMY[item.id] ? `${ROOMY[item.id].tab} ` : ""
              }${active ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
            >
              <item.icon className="size-5" aria-hidden />
              {item.short ?? item.title}
            </Link>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 border-b-2 border-transparent px-1 text-xs font-medium text-muted-foreground max-sm:border-t-2 max-sm:border-b-0 aria-expanded:text-foreground"
            >
              <Menu className="size-5" aria-hidden />
              More
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate font-medium text-foreground text-sm">{user.name}</span>
              <span className="block truncate text-muted-foreground text-xs">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {more.map((item) => (
              <DropdownMenuItem key={item.id} asChild className={ROOMY[item.id]?.menu}>
                <Link href={item.url} prefetch={false}>
                  <item.icon /> {item.title}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => signOutOfDevice({ callbackUrl: "/auth/v2/login" })}>
              <LogOut /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
