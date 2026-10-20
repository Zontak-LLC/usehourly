"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChevronDown } from "lucide-react";

type Group = { id: string; title: string; topics: { slug: string; title: string }[] };

/**
 * The guide's own contents list: every topic under its group, the page you are on marked like the app's side menu (a
 * bar in the accent colour and bolder text). Down the left on a wide screen and sticky; on a phone a folded "All topics"
 * list at the top. With the app's left menu switched on, the wide column gives way to the folded list, so there is never a second left menu.
 */
export function GuideSideNav({ groups }: { groups: Group[] }) {
  const pathname = usePathname();
  const link = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        prefetch={false}
        aria-current={active ? "page" : undefined}
        className={`relative block rounded-lg px-3 py-1.5 text-sm ${
          active
            ? "bg-muted font-semibold text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-primary"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        }`}
      >
        {label}
      </Link>
    );
  };
  const list = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        {link("/help", "All topics")}
        {link("/help/faq", "FAQ")}
      </div>
      {groups.map((g) => (
        <div key={g.id} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wide">{g.title}</p>
          {g.topics.map((t) => link(`/help/${t.slug}`, t.title))}
        </div>
      ))}
    </div>
  );
  return (
    <>
      <nav
        aria-label="Guide topics"
        className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] self-start overflow-y-auto pb-6 lg:block lg:[html[data-nav-position=left]_&]:hidden"
      >
        {list}
      </nav>
      <details className="mb-6 rounded-xl border bg-card lg:hidden lg:[html[data-nav-position=left]_&]:block">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 font-medium text-sm [&::-webkit-details-marker]:hidden">
          Browse all topics <ChevronDown className="size-4" aria-hidden />
        </summary>
        <nav aria-label="Guide topics (phone)" className="px-2 pb-3">
          {list}
        </nav>
      </details>
    </>
  );
}
