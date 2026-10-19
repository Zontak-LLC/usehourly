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
const CENTER = "[html[data-nav-collapsed=collapsed]_&]:justify-center [html[data-nav-collapsed=collapsed]_&]:px-0";

function Item({ item, active }: { item: NavLink; active: boolean }) {
  return (
    <Link
      href={item.url}
      aria-current={active ? "page" : undefined}
      title={item.title}
      className={`flex min-h-10 items-center gap-3 rounded-lg px-3 font-medium text-sm transition-colors ${CENTER} ${
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <item.icon className="size-5 shrink-0" aria-hidden />
      <span className={`truncate ${WORDS}`}>{item.title}</span>
    </Link>
  );
}

/**
 * The left-hand navigation some people prefer on a wide screen (Settings gear > Navigation). Same pages as the tab
 * strip, plus the rarely used ones under "More", the signed-in person and Log out. Hidden unless chosen, and never on
 * a phone, which keeps its bottom bar.
 */
export function SideNav({ user, isAdmin = false }: { user: { name: string; email: string }; isAdmin?: boolean }) {
  const pathname = usePathname();
  const collapsed = usePreferencesStore((s) => s.values.nav_collapsed === "collapsed");
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const all = [...navLinks, ...(isAdmin ? adminLinks : [])];
  const main = all.filter((l) => !l.secondary);
  const more = all.filter((l) => l.secondary);
  const isActive = (url: string) => pathname === url || pathname.startsWith(`${url}/`);

  return (
    <nav
      aria-label="Side menu"
      className={`${SHOW} sticky top-0 h-dvh shrink-0 flex-col gap-1 border-r bg-background p-3 w-60 [html[data-nav-collapsed=collapsed]_&]:w-16`}
    >
      <Link
        href="/dashboard/today"
        className={`mb-2 flex items-center gap-2 px-2 py-1 font-semibold text-base ${CENTER}`}
      >
        <LogoMark className="size-6 shrink-0" aria-hidden />
        <span className={WORDS}>UseHourly</span>
      </Link>
      <div className="flex flex-col gap-1">
        {main.map((l) => (
          <Item key={l.id} item={l} active={isActive(l.url)} />
        ))}
      </div>
      <p className={`mt-4 px-3 font-medium text-muted-foreground text-xs ${WORDS}`}>More</p>
      <div className="flex flex-col gap-1 [html[data-nav-collapsed=collapsed]_&]:mt-4 [html[data-nav-collapsed=collapsed]_&]:border-t [html[data-nav-collapsed=collapsed]_&]:pt-4">
        {more.map((l) => (
          <Item key={l.id} item={l} active={isActive(l.url)} />
        ))}
      </div>
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
          onClick={() => setPreference("nav_collapsed", collapsed ? "open" : "collapsed")}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          <span className={WORDS}>Collapse menu</span>
        </Button>
      </div>
    </nav>
  );
}
