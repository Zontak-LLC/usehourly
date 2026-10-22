import type { ReactNode } from "react";

import Link from "next/link";

import { LogoMark } from "@/components/logo";
import { round3 } from "@/lib/round3";

// The form, centered on paper: a big pale clock ring and an amber glow behind it, the logo in the corner. The ring is
// drawing only (hidden from screen readers, never in the way of a click).
export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-[46rem] max-w-[160vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--amber)_22%,transparent),transparent)]"
      />
      <svg
        aria-hidden
        viewBox="0 0 200 200"
        className="pointer-events-none absolute top-1/2 left-1/2 size-[44rem] max-w-[150vw] -translate-x-1/2 -translate-y-1/2 text-foreground/[0.06] motion-safe:animate-[spin_240s_linear_infinite]"
      >
        <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i / 60) * Math.PI * 2;
          const r2 = i % 5 === 0 ? 86 : 92;
          return (
            <line
              key={i}
              x1={round3(100 + 96 * Math.sin(a))}
              y1={round3(100 - 96 * Math.cos(a))}
              x2={round3(100 + r2 * Math.sin(a))}
              y2={round3(100 - r2 * Math.cos(a))}
              stroke="currentColor"
              strokeWidth={i % 5 === 0 ? 2 : 1}
            />
          );
        })}
        <line x1="100" y1="100" x2="100" y2="22" stroke="var(--amber)" strokeWidth="2" opacity="0.5" />
      </svg>
      <Link href="/" className="absolute top-5 left-6 z-10 flex items-center gap-2 font-bold font-display text-lg">
        <LogoMark className="size-7" /> UseHourly
      </Link>
      <div className="relative z-10 flex min-h-dvh items-center justify-center p-2 py-20">{children}</div>
    </main>
  );
}
