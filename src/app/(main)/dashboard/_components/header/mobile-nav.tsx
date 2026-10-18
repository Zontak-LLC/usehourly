"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Menu } from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { navLinks } from "@/navigation/sidebar/sidebar-items";

const MAIN = ["today", "week", "month", "invoices"];

/**
 * The four pages used most as a strip under the top bar, on every screen size. Every tab has an icon
 * and a word, and "More" opens the full menu (my work, report, account).
 */
export function MobileNav() {
  const pathname = usePathname();
  const { toggleSidebar } = useSidebar();
  const items = MAIN.map((id) => navLinks.find((l) => l.id === id)).filter((l) => l !== undefined);

  return (
    <nav aria-label="Main pages" className="sticky top-12 z-40 border-b bg-background">
      <div className="mx-auto grid max-w-5xl grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.url || pathname.startsWith(`${item.url}/`);
          return (
            <Link
              key={item.id}
              href={item.url}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 border-b-2 px-1 text-xs font-medium ${
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              <item.icon className="size-5" aria-hidden />
              {item.title}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 border-b-2 border-transparent px-1 text-xs font-medium text-muted-foreground"
        >
          <Menu className="size-5" aria-hidden />
          More
        </button>
      </div>
    </nav>
  );
}
