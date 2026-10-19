import type { inferRouterOutputs } from "@trpc/server";

import { CardTitle } from "@/components/card-title";
import { SectionGroupProvider } from "@/components/section-card";
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
      <div className="border-b bg-band-2 px-4 py-3">
        <CardTitle as="h2" id={`${id}-heading`} title={title} note={description} className="text-lg" />
      </div>
      <SectionGroupProvider value>
        {/* The page is as wide as the others, but a text box stays a comfortable length: fields stop at 28rem. */}
        <div className="divide-y [&_input:not([type=checkbox]):not([type=radio]):not([type=file])]:max-w-md [&_select]:max-w-md [&_textarea]:max-w-md">
          {children}
        </div>
      </SectionGroupProvider>
    </section>
  );
}
