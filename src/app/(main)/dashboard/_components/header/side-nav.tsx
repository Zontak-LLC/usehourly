"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoMark } from "@/components/logo";
import { adminLinks, type NavLink, navLinks } from "@/navigation/sidebar/sidebar-items";

// The menu is always in the page; CSS on <html> decides whether it shows (data-nav-position=left, from 1024px wide),
// so the first paint is right and nothing flickers or mismatches.
const SHOW = "hidden lg:[html[data-nav-position=left]_&]:flex";
// Pages grouped by what they are for. The groups are only spaced apart: no headings (they were noise for nine links).
const GROUPS = [
  { title: "Track", ids: ["today", "week", "month"] },
  { title: "Bill", ids: ["invoices", "report"] },
  { title: "Manage", ids: ["clients", "team"] },
  { title: "Settings", ids: ["account", "help", "insights"] },
] as const;

function Item({ item, active }: { item: NavLink; active: boolean }) {
  return (
    <Link
      href={item.url}
      aria-current={active ? "page" : undefined}
      className={`group/item relative flex min-h-11 items-center gap-3 rounded-full px-3 text-sm outline-none transition-all duration-200 focus-visible:ring-4 focus-visible:ring-amber/40 ${
        active
          ? "bg-gradient-to-b from-[color-mix(in_oklab,var(--amber)_82%,white)] to-amber font-bold text-[#12151b] shadow-[0_1px_0_rgb(255_255_255/0.35)_inset,0_8px_18px_-8px_color-mix(in_oklab,var(--amber)_80%,transparent)]"
          : "font-medium text-foreground/75 hover:bg-muted hover:text-foreground"
      }`}
    >
      <span
        aria-hidden
        className={`grid size-7 shrink-0 place-items-center rounded-full transition-colors ${
          active
            ? "bg-[#12151b] text-amber"
            : "bg-muted text-foreground/75 group-hover/item:bg-foreground/10 group-hover/item:text-foreground"
        }`}
      >
        <item.icon className="size-4" />
      </span>
      <span className="truncate">{item.title}</span>
    </Link>
  );
}

/**
 * The left-hand navigation, shown on a wide screen by default (Settings gear > Navigation lets someone choose the tab
 * strip along the top instead). Same pages as the tab strip, plus the rest, in groups spaced apart (Today, Week, Month;
 * Invoices, Year summary; Clients, Team; Account, Guide), without headings; the signed-in person and Log out are in the top bar. The current page has a
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
    <nav aria-label="Side menu" className={`${SHOW} sticky top-0 h-dvh w-72 shrink-0 flex-col p-3 print:hidden`}>
      <div className="flex h-full flex-col gap-1 overflow-y-auto rounded-3xl bg-card p-3 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10">
        <Link
          href="/dashboard/today"
          className="mb-3 flex items-center gap-2.5 rounded-2xl px-2 py-2 font-display font-extrabold text-xl tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-amber/40"
        >
          <LogoMark className="size-7 shrink-0" aria-hidden />
          UseHourly
        </Link>
        {groups.map((g) => (
          <div
            key={g.title}
            className="not-first:mt-3 flex flex-col gap-1 not-first:border-foreground/10 not-first:border-t not-first:pt-3"
          >
            {g.items.map((l) => (
              <Item key={l.id} item={l} active={isActive(l.url)} />
            ))}
          </div>
        ))}
        <p className="mt-auto px-3 pt-4 font-mono text-[10px] text-foreground/60 uppercase tracking-widest">
          Free · open source
        </p>
      </div>
    </nav>
  );
}
