import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/server/routers/_app";

type Outputs = inferRouterOutputs<AppRouter>;

export const SECTIONS = [
  { id: "account", label: "Your account" },
  { id: "invoices", label: "Invoices" },
  { id: "data", label: "Your data" },
  { id: "ai", label: "AI assistants" },
  { id: "support", label: "Support" },
] as const;

export type AccountMe = Outputs["account"]["me"];
export type EmailEnabled = Outputs["account"]["emailEnabled"] | undefined;

/** A labelled group of cards, so a long page reads as a few clear topics. */
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
    <section id={id} aria-labelledby={`${id}-heading`} className="flex scroll-mt-20 flex-col gap-3">
      <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
        <h2 id={`${id}-heading`} className="font-semibold text-lg">
          {title}
        </h2>
        <p className="text-foreground/70 text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}
