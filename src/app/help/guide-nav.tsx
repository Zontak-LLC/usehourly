"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Guide and FAQ links in the guide's header; the one you are on stays pressed (and says so to a screen reader). */
export function GuideNav() {
  const pathname = usePathname();
  const onFaq = pathname === "/help/faq";
  const tab = (active: boolean) =>
    `rounded-lg px-3 py-2 ${active ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`;
  return (
    <nav aria-label="Guide" className="flex items-center gap-1 text-sm">
      <Link href="/help" prefetch={false} aria-current={onFaq ? undefined : "page"} className={tab(!onFaq)}>
        Guide
      </Link>
      <Link href="/help/faq" prefetch={false} aria-current={onFaq ? "page" : undefined} className={tab(onFaq)}>
        FAQ
      </Link>
      <Link
        href="/dashboard/today"
        prefetch={false}
        className="ml-1 rounded-lg border bg-card px-3 py-2 font-medium hover:bg-muted"
      >
        Open the app
      </Link>
    </nav>
  );
}
