"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoMark } from "@/components/logo";
import { adminLinks, type NavLink, navLinks } from "@/navigation/sidebar/sidebar-items";

// The menu is always in the page; CSS on <html> decides whether it shows (data-nav-position=left, from 1024px wide),
// so the first paint is right and nothing flickers or mismatches.
const SHOW = "hidden lg:[html[data-nav-position=left]_&]:flex";
// Pages grouped by what they are for, with a small heading each.
const GROUPS = [
  { title: "Track", ids: ["today", "week", "month"] },
  { title: "Bill", ids: ["invoices", "report"] },
  { title: "Manage", ids: ["clients", "team"] },
  { title: "Settings", ids: ["account", "guide", "insights"] },
] as const;

function Item({ item, active }: { item: NavLink; active: boolean }) {
  return (
    <Link
      href={item.url}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
        active
          ? "bg-muted font-semibold text-foreground before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary"
          : "font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <item.icon className="size-5 shrink-0" aria-hidden />
      <span className="truncate">{item.title}</span>
    </Link>
  );
}

/**
 * The left-hand navigation, shown on a wide screen by default (Settings gear > Navigation lets someone choose the tab
 * strip along the top instead). Same pages as the tab strip, plus the rest, grouped under small headings by what they
 * are for (Track, Bill, Manage, Settings); the signed-in person and Log out are in the top bar. The current page has a
 * bar in the accent colour beside it. Never on a phone, which keeps its bottom bar. It is always open: there is no
 * icons-only mode.
 */
export function SideNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const byId = new Map([...navLinks, ...adminLinks].map((l) => [l.id, l]));
  const groups = GROUPS.map((g) => ({
    title: g.title,
    items: g.ids.filter((id) => id !== "insights" || isAdmin).flatMap((id) => byId.get(id) ?? []),
  })).filter((g) => g.items.length > 0);
  const isActive = (url: string) => pathname === url || pathname.startsWith(`${url}/`);

  return (
    <nav aria-label="Side menu" className={`${SHOW} sticky top-0 h-dvh w-60 shrink-0 flex-col gap-1 bg-background p-3`}>
      <Link href="/dashboard/today" className="mb-2 flex items-center gap-2 px-2 py-1 font-semibold text-base">
        <LogoMark className="size-6 shrink-0" aria-hidden />
        UseHourly
      </Link>
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-1">
          <p className="mt-3 mb-1 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            {g.title}
          </p>
          {g.items.map((l) => (
            <Item key={l.id} item={l} active={isActive(l.url)} />
          ))}
        </div>
      ))}
    </nav>
  );
}
