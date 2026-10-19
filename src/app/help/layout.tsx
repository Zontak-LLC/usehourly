import type { ReactNode } from "react";

import Link from "next/link";

import { LogoMark } from "@/components/logo";
import { GROUPS, TOPICS } from "@/content/guide";

import { GuideNav } from "./guide-nav";
import { GuideSideNav } from "./guide-side-nav";

/** The frame for the guide and FAQ: public, so it can be linked from anywhere and read with no account. */
export default function HelpLayout({ children }: { children: ReactNode }) {
  const groups = GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    topics: TOPICS.filter((t) => t.group === g.id).map((t) => ({ slug: t.slug, title: t.title })),
  }));
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <LogoMark className="size-7" />
          UseHourly
        </Link>
        <GuideNav />
      </header>
      <div className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <GuideSideNav groups={groups} />
        <main className="min-w-0 max-w-3xl">{children}</main>
      </div>
    </div>
  );
}
