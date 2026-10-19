"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { signOutOfDevice } from "@/lib/sign-out";
import { adminLinks, type NavLink, navLinks } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

// The menu is always in the page; CSS on <html> decides whether it shows (data-nav-position=left, from 1024px wide)
// and whether it is icons only (data-nav-collapsed), so the first paint is right and nothing flickers or mismatches.
const SHOW = "hidden lg:[html[data-nav-position=left]_&]:flex";
// Whole class names, written out: Tailwind only generates styles for class names it can read in full.
const WORDS = "[html[data-nav-collapsed=collapsed]_&]:sr-only";
// Pages grouped by what they are for, with a small heading each (the headings give way to dividers when collapsed).
const GROUPS = [
  { title: "Track", ids: ["today", "week", "month"] },
  { title: "Bill", ids: ["invoices", "report"] },
  { title: "Manage", ids: ["clients", "team"] },
  { title: "Settings", ids: ["account", "guide", "insights"] },
] as const;
const DIVIDE =
  "[html[data-nav-collapsed=collapsed]_&]:border-t [html[data-nav-collapsed=collapsed]_&]:pt-2 [html[data-nav-collapsed=collapsed]_&]:first:border-t-0";
const CENTER = "[html[data-nav-collapsed=collapsed]_&]:justify-center [html[data-nav-collapsed=collapsed]_&]:px-0";

function Item({ item, active }: { item: NavLink; active: boolean }) {
  return (
    <Link
      href={item.url}
      aria-current={active ? "page" : undefined}
      title={item.title}
      className={`relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${CENTER} ${
        active
          ? "bg-muted font-semibold text-foreground before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary"
          : "font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <item.icon className="size-5 shrink-0" aria-hidden />
      <span className={`truncate ${WORDS}`}>{item.title}</span>
    </Link>
  );
}

/**
 * The left-hand navigation some people prefer on a wide screen (Settings gear > Navigation). Same pages as the tab
 * strip, plus the rest, grouped under small headings by what they are for (Track, Bill, Manage, Settings), the signed-in person and Log out; the current page has a bar in the accent colour beside it. Hidden unless chosen, and never on
 * a phone, which keeps its bottom bar.
 */
export function SideNav({ user, isAdmin = false }: { user: { name: string; email: string }; isAdmin?: boolean }) {
  const pathname = usePathname();
  const collapsed = usePreferencesStore((s) => s.values.nav_collapsed === "collapsed");
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const byId = new Map([...navLinks, ...adminLinks].map((l) => [l.id, l]));
  const groups = GROUPS.map((g) => ({
    title: g.title,
    items: g.ids.filter((id) => id !== "insights" || isAdmin).flatMap((id) => byId.get(id) ?? []),
  })).filter((g) => g.items.length > 0);
  const isActive = (url: string) => pathname === url || pathname.startsWith(`${url}/`);

  const toggle = () => setPreference("nav_collapsed", collapsed ? "open" : "collapsed");
  // Double-clicking the menu itself (not a link or a button) folds or unfolds it, like the collapse button does (that
  // button is the way for a keyboard or screen reader; this is only a mouse shortcut).
  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    window.getSelection()?.removeAllRanges(); // a double click also selects text under it
    toggle();
  };

  return (
    <nav
      onDoubleClick={onDoubleClick}
      aria-label="Side menu"
      className={`${SHOW} select-none sticky top-0 h-dvh shrink-0 flex-col gap-1 bg-background p-3 w-60 [html[data-nav-collapsed=collapsed]_&]:w-16`}
    >
      <Link
        href="/dashboard/today"
        className={`mb-2 flex items-center gap-2 px-2 py-1 font-semibold text-base ${CENTER}`}
      >
        <LogoMark className="size-6 shrink-0" aria-hidden />
        <span className={WORDS}>UseHourly</span>
      </Link>
      {groups.map((g) => (
        <div key={g.title} className={`flex flex-col gap-1 ${DIVIDE}`}>
          <p className={`mt-3 mb-1 px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide ${WORDS}`}>
            {g.title}
          </p>
          {g.items.map((l) => (
            <Item key={l.id} item={l} active={isActive(l.url)} />
          ))}
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-1 border-t pt-3">
        <div className={`px-3 ${WORDS}`}>
          <p className="truncate font-medium text-sm">{user.name}</p>
          <p className="truncate text-muted-foreground text-xs">{user.email}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="justify-start [html[data-nav-collapsed=collapsed]_&]:justify-center"
          title="Log out"
          onClick={() => signOutOfDevice({ callbackUrl: "/auth/v2/login" })}
        >
          <LogOut /> <span className={WORDS}>Log out</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="justify-start [html[data-nav-collapsed=collapsed]_&]:justify-center"
          aria-pressed={collapsed}
          title={collapsed ? "Show the menu with words" : "Show icons only"}
          onClick={toggle}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          <span className={WORDS}>Collapse menu</span>
        </Button>
      </div>
    </nav>
  );
}
