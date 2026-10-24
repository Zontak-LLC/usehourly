"use client";

import type { MouseEvent, ReactNode } from "react";

import Link from "next/link";

import { ChevronLeft } from "lucide-react";

/**
 * A list beside the chosen item, in ONE card (Clients, issue 238; Account, issue 283). From 768px the list sits on the
 * left and the item on the right; on a phone they are two screens: `view` says which one shows, and the item's screen
 * starts with a "‹ back" link to the list.
 */
export function SplitView({
  view,
  list,
  back,
  headerless,
  detailClassName = "",
  children,
}: {
  view: "list" | "detail";
  list: ReactNode;
  /** The phone's way back from the item to the list. */
  back: { href: string; label: string; onBack: () => void };
  /** Why the card has no header band of its own (the page check asks for a reason). */
  headerless: string;
  detailClassName?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-headerless={headerless}
      data-view={view}
      className="group/split grid overflow-clip rounded-xl border bg-card md:grid-cols-[17rem_minmax(0,1fr)]"
    >
      <div className="min-w-0 bg-muted/40 group-data-[view=detail]/split:max-md:hidden md:border-r">{list}</div>
      <div className={`flex min-w-0 flex-col group-data-[view=list]/split:max-md:hidden ${detailClassName}`}>
        <Link
          href={back.href}
          onClick={(e) => {
            e.preventDefault();
            back.onBack();
          }}
          className="flex min-h-11 items-center gap-1 px-3 pt-2 text-foreground/80 text-sm md:hidden"
        >
          <ChevronLeft className="size-4" aria-hidden /> {back.label}
        </Link>
        {children}
      </div>
    </div>
  );
}

/**
 * One row of a split view's list: a real link to the item's own address (so it opens in a new tab and works without
 * script); a plain click selects it in place, keeping the search and the scroll.
 */
export function SplitRow({
  href,
  selected,
  onOpen,
  leading,
  title,
  line,
  trailing,
  quiet = false,
  external = false,
}: {
  href: string;
  selected: boolean;
  /** Left out for a link that leaves the page (`external`). */
  onOpen?: () => void;
  leading: ReactNode;
  title: string;
  /** The one line under the name. */
  line: string;
  trailing?: ReactNode;
  quiet?: boolean;
  external?: boolean;
}) {
  function click(e: MouseEvent<HTMLAnchorElement>) {
    // A new tab or window (Ctrl, Cmd, Shift, middle click) is the browser's job.
    if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onOpen();
  }
  return (
    <a
      href={href}
      onClick={click}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      aria-current={selected ? "page" : undefined}
      className={`grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 text-left ${
        selected ? "bg-card shadow-sm ring-1 ring-foreground/15" : "hover:bg-card/70"
      }`}
    >
      {leading}
      <span className="min-w-0">
        <span className={`block truncate text-sm ${quiet ? "font-medium text-foreground/80" : "font-semibold"}`}>
          {title}
        </span>
        <span className="block truncate text-foreground/70 text-xs">{line}</span>
      </span>
      {trailing}
    </a>
  );
}
