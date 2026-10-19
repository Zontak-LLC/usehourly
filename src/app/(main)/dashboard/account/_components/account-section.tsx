import type { inferRouterOutputs } from "@trpc/server";
import { Database, FileText, Heart, Sparkles, UserRound } from "lucide-react";

import { SectionGroupProvider } from "@/components/section-card";
import type { AppRouter } from "@/server/routers/_app";

type Outputs = inferRouterOutputs<AppRouter>;

export const SECTIONS = [
  { id: "account", label: "Your account", icon: UserRound },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "data", label: "Your data", icon: Database },
  { id: "ai", label: "AI assistants", icon: Sparkles },
  { id: "support", label: "Support", icon: Heart },
] as const;

export type AccountMe = Outputs["account"]["me"];
export type EmailEnabled = Outputs["account"]["emailEnabled"] | undefined;

/**
 * One grouped card per topic: the neutral header band (same as every card) is its top band and the cards inside are separated by thin lines
 * (they flatten themselves through SectionGroupProvider), so a long page reads as a few clear sections.
 */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: (typeof SECTIONS)[number]["id"];
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-20 overflow-hidden rounded-xl border bg-card"
    >
      <div className="border-b bg-muted/40 px-4 py-3">
        <h2 id={`${id}-heading`} className="font-semibold text-lg">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <SectionGroupProvider value>
        <div className="divide-y">{children}</div>
      </SectionGroupProvider>
    </section>
  );
}
