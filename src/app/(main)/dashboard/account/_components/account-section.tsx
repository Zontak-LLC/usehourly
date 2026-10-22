import type { inferRouterOutputs } from "@trpc/server";

import { SectionGroupProvider } from "@/components/section-card";
import type { AppRouter } from "@/server/routers/_app";

type Outputs = inferRouterOutputs<AppRouter>;

export const SECTIONS = [
  { id: "account", label: "Profile" },
  { id: "invoices", label: "Invoices" },
  { id: "data", label: "Your data" },
  { id: "ai", label: "AI assistants" },
] as const;

export type AccountMe = Outputs["account"]["me"];
export type EmailEnabled = Outputs["account"]["emailEnabled"] | undefined;

/**
 * One section per topic: a big display heading and a line under it, then the cards of that topic as soft white sheets
 * (rings, not borders, so the page's nesting rule holds). They find out they are in a section through SectionGroupProvider.
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
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-20">
      <div className="px-1 pb-4">
        <h2 id={`${id}-heading`} className="font-display font-extrabold text-3xl leading-none sm:text-4xl">
          {title}
        </h2>
        <p className="mt-2 text-foreground/75">{description}</p>
      </div>
      <SectionGroupProvider value>
        {/* The page is as wide as the others, but a text box stays a comfortable length: fields stop at 28rem. */}
        <div className="flex flex-col gap-4 [&_input:not([type=checkbox]):not([type=radio]):not([type=file])]:max-w-md [&_select]:max-w-md [&_textarea]:max-w-md">
          {children}
        </div>
      </SectionGroupProvider>
    </section>
  );
}
