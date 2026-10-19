"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogOut, Menu } from "lucide-react";
import { signOut } from "next-auth/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { adminLinks, navLinks } from "@/navigation/sidebar/sidebar-items";

const MAIN = ["today", "week", "month", "invoices", "clients"];
/** One colour per tab, on the icon only (the label and the active marker stay neutral). */
const TAB_COLOR: Record<string, string> = {
  today: "text-yellow-600 dark:text-yellow-400",
  week: "text-sky-600 dark:text-sky-400",
  month: "text-violet-600 dark:text-violet-400",
  invoices: "text-emerald-600 dark:text-emerald-400",
  clients: "text-orange-600 dark:text-orange-400",
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
      className="max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 z-40 border-b bg-background max-sm:border-t max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)] sm:sticky sm:top-12"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-6">
        {items.map((item) => {
          const active = pathname === item.url || pathname.startsWith(`${item.url}/`);
          return (
            <Link
              key={item.id}
              href={item.url}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 border-b-2 px-1 text-xs font-medium max-sm:border-t-2 max-sm:border-b-0 ${
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              <item.icon className={`size-5 ${TAB_COLOR[item.id] ?? ""}`} aria-hidden />
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
              <DropdownMenuItem key={item.id} asChild>
                <Link href={item.url} prefetch={false}>
                  <item.icon /> {item.title}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/auth/v2/login" })}>
              <LogOut /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
